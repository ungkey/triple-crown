#!/usr/bin/env node
'use strict';

// Legacy Triple Crown installation backup / verify / restore.
// Self-contained: a copy of this file is placed inside every backup so the
// backup alone can restore the machine (design doc §2.1, §2.5).

const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');
const crypto = require('crypto');

const ROUTING_START = '<!-- triple-crown:managed-routing:start -->';
const ROUTING_END = '<!-- triple-crown:managed-routing:end -->';
const SHIP_GUARD = 'triple-crown-ship-guard.cjs';
const CAPABILITIES = ['triple-gstack', 'triple-superpowers', 'triple-crown-guide'];
const SKILL_MARKERS = ['.triple-crown-skill', '.crew-skill'];
// Triple Crown이 '소유'하지 않고 '일부 구간만 편집'하는 사용자 파일. 백업은 하되 통째로 지우거나
// 되돌리지 않는다 (restoreOrder에서 제외 — 설계 §2.5.1의 의미 기반 재삽입 대상).
const SEMANTIC = new Set(['CLAUDE.md', '.claude/settings.json']);

function log(m = '') { process.stdout.write(String(m) + '\n'); }
const CLEANUP = [];
function cleanup() {
  while (CLEANUP.length) {
    try { fs.rmSync(CLEANUP.pop(), { recursive: true, force: true }); } catch { /* best effort */ }
  }
}
function fail(msg, code = 1) { cleanup(); process.stderr.write(`legacy-backup: ${msg}\n`); process.exit(code); }
function sha256(buf) { return 'sha256:' + crypto.createHash('sha256').update(buf).digest('hex'); }
function exists(p) { try { fs.lstatSync(p); return true; } catch { return false; } }
function readJson(p) { return JSON.parse(fs.readFileSync(p, 'utf8')); }

// 백업 디렉터리 이름은 셸 `date +%F`와 같은 로컬 날짜여야 한다 (설계 §2.1 런북과 동일 규약).
// toISOString()은 UTC라 KST 00:00-09:00 구간에서 런북 조회 경로와 하루 어긋난다.
function localDate(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function walkFiles(abs, rel, out) {
  const st = fs.lstatSync(abs);
  if (st.isSymbolicLink()) {
    out.push({ path: rel, kind: 'symlink',
      sha256: sha256(Buffer.from('symlink:' + fs.readlinkSync(abs))), bytes: 0, mode: st.mode & 0o777 });
    return;
  }
  if (st.isFile()) {
    const buf = fs.readFileSync(abs);
    out.push({ path: rel, kind: 'file', sha256: sha256(buf), bytes: buf.length, mode: st.mode & 0o777 });
    return;
  }
  if (st.isDirectory()) {
    out.push({ path: rel, kind: 'dir', sha256: null, bytes: 0, mode: st.mode & 0o777 });
    for (const e of fs.readdirSync(abs).sort()) walkFiles(path.join(abs, e), `${rel}/${e}`, out);
  }
}

function collectTargets(home) {
  const targets = [];
  const dir = (rel) => { if (exists(path.join(home, rel))) targets.push({ rel, kind: 'dir' }); };
  const file = (rel) => { if (exists(path.join(home, rel))) targets.push({ rel, kind: 'file' }); };
  dir('.triple-crown');
  for (const id of CAPABILITIES) dir(`.gsd/capabilities/${id}`);
  file(`.claude/hooks/${SHIP_GUARD}`);
  const skillsRoot = path.join(home, '.claude', 'skills');
  if (exists(skillsRoot)) {
    for (const e of fs.readdirSync(skillsRoot).sort()) {
      const d = path.join(skillsRoot, e);
      if (fs.statSync(d).isDirectory() && SKILL_MARKERS.some((m) => exists(path.join(d, m)))) {
        targets.push({ rel: `.claude/skills/${e}`, kind: 'dir' });
      }
    }
  }
  file('CLAUDE.md');
  file('.claude/settings.json');
  return targets;
}

function extractFragment(home) {
  const p = path.join(home, 'CLAUDE.md');
  if (!exists(p)) return { present: false };
  const lines = fs.readFileSync(p, 'utf8').split('\n');
  const s = lines.findIndex((l) => l.trim() === ROUTING_START);
  const e = lines.findIndex((l) => l.trim() === ROUTING_END);
  if (s === -1 || e === -1 || e < s) return { present: false };
  const fragment = lines.slice(s, e + 1).join('\n') + '\n';
  return { present: true, startLine: s + 1, endLine: e + 1, fragment,
    fragmentSha256: sha256(Buffer.from(fragment)) };
}

// opts.tolerant: when the file exists but is not valid JSON, return a
// { present: true, group: null, parseError: true } result instead of calling
// fail() and exiting. Only `detect` passes this — a judgment tool must never
// die on a hand-edited settings.json (design doc §1.2/§1.3, review round 1).
// `backup` calls this with no opts and keeps the loud fail(): a manifest that
// silently records hasHookGroup:false for a file it could not parse would be
// a false backup, and `restore` (Task 4-6) trusts that manifest.
function extractHookGroup(home, opts = {}) {
  const p = path.join(home, '.claude', 'settings.json');
  if (!exists(p)) return { present: false };
  const raw = fs.readFileSync(p);
  let parsed;
  try { parsed = JSON.parse(raw.toString('utf8')); }
  catch (err) {
    if (opts.tolerant) return { present: true, sha256: sha256(raw), group: null, parseError: true };
    fail(`~/.claude/settings.json is not valid JSON: ${err.message}`, 2);
  }
  const pre = parsed && parsed.hooks && parsed.hooks.PreToolUse;
  const groups = Array.isArray(pre) ? pre.filter((g) =>
    Array.isArray(g && g.hooks) &&
    g.hooks.some((h) => String((h && h.command) || '').includes(SHIP_GUARD))) : [];
  if (groups.length > 1) fail(`unexpected: ${groups.length} ship-guard hook groups in settings.json`, 2);
  return { present: true, sha256: sha256(raw), group: groups[0] || null };
}

// "레거시가 설치돼 있는가"의 판정. 파일 존재가 아니라 **Triple Crown이 심은 것**을 센다.
// ~/.claude/settings.json은 Claude Code가 깔린 거의 모든 머신에 있다 — 그걸 세면 레거시를
// 설치한 적 없는 PC에서도 0이 안 나오고, Task 9의 "0이면 스킵" 분기가 영영 안 걸린다.
function legacySignals(home, targets, frag, hook) {
  const owned = targets.filter((t) => !SEMANTIC.has(t.rel));
  return {
    owned,
    count: owned.length + (frag.present ? 1 : 0) + (hook.present && hook.group ? 1 : 0),
  };
}

function backup(opts) {
  const home = os.homedir();
  const dest = opts.dest || path.join(home, '.crew-legacy-backup', localDate());
  if (exists(dest) && fs.readdirSync(dest).length) {
    fail(`backup destination already exists and is not empty: ${dest}`, 2);
  }
  const targets = collectTargets(home);
  const frag = extractFragment(home);
  const hook = extractHookGroup(home);
  // 판정은 detect와 같은 술어를 쓴다. stock settings.json 하나만 있는 홈을 "백업했다"고
  // 말하면 그게 가장 위험한 거짓 안심이다.
  if (!legacySignals(home, targets, frag, hook).count) {
    fail('nothing to back up: no legacy installation found', 2);
  }
  const files = [];
  for (const t of targets) walkFiles(path.join(home, t.rel), t.rel, files);

  fs.mkdirSync(dest, { recursive: true });
  const tar = cp.spawnSync('tar',
    ['-czf', path.join(dest, 'archive.tar.gz'), '-C', home, '--', ...targets.map((t) => t.rel)],
    { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' });
  if (tar.error || tar.status !== 0) {
    fail(`tar failed: ${(tar.stderr || (tar.error && tar.error.message) || '').trim()}`, 2);
  }
  if (frag.present) fs.writeFileSync(path.join(dest, 'CLAUDE.md.fragment'), frag.fragment);
  if (hook.present && hook.group) {
    fs.writeFileSync(path.join(dest, 'settings.json.hookgroup'), JSON.stringify(hook.group, null, 2) + '\n');
  }
  const manifest = {
    schema: 1,
    createdAt: new Date().toISOString(),
    home,
    restoreOrder: targets.filter((t) => !SEMANTIC.has(t.rel)).map((t) => t.rel),
    targets,
    files,
    claudeMd: frag.present
      ? { present: true, startLine: frag.startLine, endLine: frag.endLine, fragmentSha256: frag.fragmentSha256 }
      : { present: false },
    settings: hook.present
      ? { present: true, sha256: hook.sha256, hasHookGroup: !!hook.group }
      : { present: false },
  };
  fs.writeFileSync(path.join(dest, 'MANIFEST.json'), JSON.stringify(manifest, null, 2) + '\n');
  fs.copyFileSync(__filename, path.join(dest, 'legacy-backup.cjs'));
  fs.writeFileSync(path.join(dest, 'restore.sh'),
    '#!/usr/bin/env bash\nset -euo pipefail\nHERE="$(cd "$(dirname "$0")" && pwd -P)"\n' +
    'exec node "$HERE/legacy-backup.cjs" restore --from "$HERE" "$@"\n',
    { mode: 0o755 });
  log(`backup complete: ${dest}`);
  log(`targets: ${targets.length}, files: ${files.length}`);
}

function extractArchive(from) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'crew-legacy-x-'));
  CLEANUP.push(tmp);                       // 어느 실패 경로로 빠져도 fail()이 지운다
  const r = cp.spawnSync('tar', ['-xzf', path.join(from, 'archive.tar.gz'), '-C', tmp],
    { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' });
  if (r.error || r.status !== 0) {
    fail(`tar extract failed: ${(r.stderr || (r.error && r.error.message) || '').trim()}`, 2);
  }
  return tmp;
}

function verifyArchive(from) {
  if (!exists(path.join(from, 'MANIFEST.json'))) fail(`no MANIFEST.json in ${from}`, 2);
  const manifest = readJson(path.join(from, 'MANIFEST.json'));
  if (manifest.schema !== 1) fail(`unsupported manifest schema: ${manifest.schema}`, 2);
  const tmp = extractArchive(from);
  const problems = [];
  try {
    for (const f of manifest.files) {
      const abs = path.join(tmp, f.path);
      if (!exists(abs)) { problems.push(`missing in archive: ${f.path}`); continue; }
      if (f.kind === 'file') {
        if (sha256(fs.readFileSync(abs)) !== f.sha256) problems.push(`sha256 mismatch: ${f.path}`);
      } else if (f.kind === 'symlink') {
        const st = fs.lstatSync(abs);
        if (!st.isSymbolicLink() ||
            sha256(Buffer.from('symlink:' + fs.readlinkSync(abs))) !== f.sha256) {
          problems.push(`symlink mismatch: ${f.path}`);
        }
      }
    }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  return { manifest, problems };
}

function verify(opts) {
  if (!opts.from) fail('--from <backup dir> is required', 2);
  const { manifest, problems } = verifyArchive(opts.from);
  if (problems.length) {
    for (const p of problems) log(`FAIL ${p}`);
    fail(`${problems.length} mismatch(es) between MANIFEST.json and archive`, 2);
  }
  log(`verify OK: ${manifest.files.length} entries match archive`);
}

function restoreClaudeMd(home, from, manifest, actions, dryRun) {
  actions.push('CLAUDE.md: (not implemented yet)');
}

function restoreSettings(home, tmp, from, manifest, actions, dryRun) {
  actions.push('settings.json: (not implemented yet)');
}

function samePath(a, b) {
  try { return fs.realpathSync(a) === fs.realpathSync(b); }
  catch { return path.resolve(a) === path.resolve(b); }
}

// 안전 계약 1: 다른 홈에서 뜬 백업을 이 홈에 쏟지 않는다. home 필드가 아예 없는 매니페스트도
// "이 홈이 맞다"는 뜻이 아니다 — MANIFEST.json은 서명 없는 평문 JSON이라, 한 줄만 지우면
// 이 가드 전체가 무력화된다. 그 상태를 "일치"로 취급하지 않는다.
function assertRestoreHome(home, manifest, allowForeignHome) {
  if (manifest.home && samePath(home, manifest.home)) return;
  if (!allowForeignHome) {
    if (!manifest.home) {
      fail('MANIFEST.json has no home field — refusing to restore. Pass --allow-foreign-home ' +
        'only if you are certain this archive belongs on this machine.', 4);
    }
    fail(`this backup was taken from a different home (manifest.home=${manifest.home}, ` +
      `current HOME=${home}). Restoring it here would delete this home's Triple Crown state ` +
      `and replace it with another machine's. Pass --allow-foreign-home only if that is ` +
      `exactly what you intend.`, 4);
  }
  log(`WARNING: restoring a backup taken from ${manifest.home || '(unknown — MANIFEST.json has no home field)'} ` +
    `into ${home} (--allow-foreign-home)`);
}

// 안전 계약 3: rename 후 복사, 실패 시 전량 롤백. 어떤 대상도 선삭제하지 않는다.
function applyRestore(home, tmp, restoreOrder, actions) {
  const rollback = fs.mkdtempSync(path.join(home, '.crew-legacy-rollback-'));
  const moved = [];
  const created = [];
  try {
    for (const rel of restoreOrder) {
      const dst = path.join(home, rel);
      if (exists(dst)) {
        const saved = path.join(rollback, rel);
        fs.mkdirSync(path.dirname(saved), { recursive: true });
        fs.renameSync(dst, saved);                 // $HOME 내부 — cross-device 아님
        moved.push({ dst, saved });
      } else {
        created.push(dst);                          // 시작 상태에 없던 대상 — 실패 시 지워야 홈이 그대로다
      }
      fs.mkdirSync(path.dirname(dst), { recursive: true });
      fs.cpSync(path.join(tmp, rel), dst, { recursive: true });
    }
  } catch (err) {
    // 롤백 자체도 실패할 수 있다 (:rmSync/:renameSync). 여기서 또 던지면 스택 트레이스와 함께
    // exit 1로 죽고, 사용자는 원본이 어디 있는지도 모른 채 반쯤 복구된 홈만 떠안는다. 계약 3의
    // 보장은 무조건이므로, 지킬 수 없을 땐 최소한 롤백 디렉터리 경로와 아직 못 되돌린 항목을
    // 알려야 한다.
    try {
      for (const dst of created.reverse()) {
        fs.rmSync(dst, { recursive: true, force: true });
      }
      for (const m of moved.reverse()) {
        fs.rmSync(m.dst, { recursive: true, force: true });
        fs.renameSync(m.saved, m.dst);
      }
      fs.rmSync(rollback, { recursive: true, force: true });   // 롤백 완료 — 남길 이유 없음
    } catch (rollbackErr) {
      const unrestored = moved.filter((m) => exists(m.saved)).map((m) => m.dst);
      const notCleaned = created.filter((dst) => exists(dst));
      fail(`restore failed (${err.message}), and the automatic rollback also failed ` +
        `(${rollbackErr.message}). Your original files are preserved at ${rollback} — do not ` +
        `delete it.` +
        (unrestored.length ? ` Not yet restored from there: ${unrestored.join(', ')}.` : '') +
        (notCleaned.length ? ` Not yet cleaned up: ${notCleaned.join(', ')}.` : '') +
        ` Restore by hand, then investigate before retrying.`, 2);
    }
    fail(`restore failed (${err.message}) — rolled back, home is unchanged`, 2);
  }
  actions.push(`replaced targets kept for rollback at ~/${path.basename(rollback)} (delete when satisfied)`);
}

function restore(opts) {
  const home = os.homedir();
  if (!opts.from) fail('--from <backup dir> is required', 2);
  const { manifest, problems } = verifyArchive(opts.from);   // 설계 §2.5 1단계
  if (problems.length) {
    for (const p of problems) log(`FAIL ${p}`);
    fail('archive does not match MANIFEST.json — aborting restore', 2);
  }
  assertRestoreHome(home, manifest, opts.allowForeignHome);   // 안전 계약 1 — 쓰기 전, dry-run도 동일
  const tmp = extractArchive(opts.from);
  const actions = [];
  try {
    // 손으로 편집한 restoreOrder의 `..` 이스케이프가 $HOME 밖을 건드리지 못하게 쓰기 전에 막는다.
    const escaped = manifest.restoreOrder.filter((rel) => {
      const resolved = path.resolve(home, rel);
      return resolved !== home && !resolved.startsWith(home + path.sep);
    });
    if (escaped.length) fail(`restoreOrder escapes $HOME: ${escaped.join(', ')} — refusing to restore`, 2);

    // 안전 계약 2: 전량 존재 확인 후에만 쓰기 단계로 넘어간다.
    const missing = manifest.restoreOrder.filter((rel) => !exists(path.join(tmp, rel)));
    if (missing.length) {
      fail(`archive is missing restore targets: ${missing.join(', ')} — nothing was changed`, 2);
    }
    for (const rel of manifest.restoreOrder) {
      actions.push(`${exists(path.join(home, rel)) ? 'overwrite' : 'create'}: ~/${rel}`);
    }
    if (!opts.dryRun) applyRestore(home, tmp, manifest.restoreOrder, actions);
    restoreClaudeMd(home, opts.from, manifest, actions, opts.dryRun);
    restoreSettings(home, tmp, opts.from, manifest, actions, opts.dryRun);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  for (const a of actions) log((opts.dryRun ? '[dry-run] ' : '') + a);
  if (opts.dryRun) { log('dry-run: no writes performed'); return; }
  log('restore complete. Verify capability registrations with: gsd-tools capability list');
}

// 판정용 — 이 머신에 실제로 뭐가 있는지만 보고한다. 부재는 오류가 아니므로 항상 exit 0.
// Task 9 런북이 파괴적 단계로 갈지 말지를 이 출력 하나로 결정한다.
function detect() {
  const home = os.homedir();
  const targets = collectTargets(home);
  const frag = extractFragment(home);
  const hook = extractHookGroup(home, { tolerant: true });
  const { owned, count } = legacySignals(home, targets, frag, hook);
  log(`home: ${home}`);
  for (const t of owned) log(`  owned  ${t.kind === 'dir' ? 'dir ' : 'file'} ~/${t.rel}`);
  log(`  CLAUDE.md routing marker: ${frag.present ? `lines ${frag.startLine}-${frag.endLine}` : 'absent'}`);
  if (hook.parseError) {
    log('  settings.json ship-guard group: UNDETERMINED (not valid JSON)');
  } else {
    log(`  settings.json ship-guard group: ${hook.present && hook.group ? 'present' : 'absent'}`);
  }
  log(`legacy targets: ${count}`);
}

function parseArgs(argv) {
  const out = { command: argv[0], dest: null, from: null, dryRun: false, allowForeignHome: false };
  const rest = argv.slice(1);
  while (rest.length) {
    const a = rest.shift();
    if (a === '--dest') out.dest = rest.shift() || fail('--dest requires a path', 2);
    else if (a === '--from') out.from = rest.shift() || fail('--from requires a path', 2);
    else if (a === '--dry-run') out.dryRun = true;
    else if (a === '--allow-foreign-home') out.allowForeignHome = true;
    else fail(`unknown option: ${a}`, 2);
  }
  return out;
}

const opts = parseArgs(process.argv.slice(2));
if (opts.command === 'detect') detect();            // Task 3 — 여기서 빠뜨리면 Task 9 Step 1이 죽는다
else if (opts.command === 'backup') backup(opts);
else if (opts.command === 'verify') verify(opts);
else if (opts.command === 'restore') restore(opts);
else fail('usage: legacy-backup.cjs detect | backup [--dest DIR] | verify --from DIR | ' +
  'restore --from DIR [--dry-run] [--allow-foreign-home]', 2);
