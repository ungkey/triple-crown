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
const { isDeepStrictEqual } = require('util');

const ROUTING_START = '<!-- triple-crown:managed-routing:start -->';
const ROUTING_END = '<!-- triple-crown:managed-routing:end -->';
const SHIP_GUARD = 'triple-crown-ship-guard.cjs';
// scripts/uninstall-legacy.cjs 가 벤더 트리 이름을 필요로 하는데, 그 파일은 개명 전 어휘를
// 하나도 갖지 않는 것이 아키텍처 주장이라 brand-names.test.cjs 허용목록에 넣을 수 없다 —
// 그래서 이 어휘도 legacy-backup.cjs 가 소유한다.
const VENDOR_DIR = '.triple-crown';
const LEGACY_CAPABILITIES = ['triple-gstack', 'triple-superpowers', 'triple-crown-guide'];
const SKILL_MARKERS = ['.triple-crown-skill', '.crew-skill'];
// 제거가 보는 마커는 구 것 하나뿐이다. SKILL_MARKERS 를 그대로 쓰면 uninstall-legacy 가
// 현행 crew 스킬까지 지운다 — 백업은 넓게 담고 제거는 좁게 지운다.
const LEGACY_SKILL_MARKERS = ['.triple-crown-skill'];
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
// restore()의 actions[]는 지금까지 원래 try 블록 뒤에서만 flush됐다 — applyRestore() 이후
// (CLAUDE.md/settings.json 재삽입 단계 포함) fail()로 빠지면 그 배열 전체가 버려졌다. 그중엔
// "복원 대상은 ~/.crew-legacy-rollback-XXXXXX에 있다"는 줄도 있어, 사용자가 원본을 어디서
// 찾을지 모르게 됐다. fail()은 process.exit로 즉시 끝나 finally도 안 돈다(위 cleanup()과 같은
// 이유) — 그래서 여기서도 명시적 등록/flush로 해결한다: restore()가 자신의 actions 배열을
// 등록해 두면, 그 이후 어디서 fail()이 나든 지금까지 쌓인 줄을 잃지 않고 stderr 종료 직전에
// stdout으로 내보낸다.
let pendingActions = null;
function trackActions(actions, dryRun) { pendingActions = { actions, dryRun }; }
function untrackActions() { pendingActions = null; }
function flushPendingActions() {
  if (!pendingActions) return;
  const { actions, dryRun } = pendingActions;
  pendingActions = null;
  for (const a of actions) log((dryRun ? '[dry-run] ' : '') + a);
}
// bin/crew.cjs:30 과 같은 모양. require 가능한 라이브러리는 process.exit 로 호출자의
// 프로세스를 끝내면 안 된다 — checkBackup(Task 2) 이 verifyArchive 를 try/catch 로 감싸도
// 아무것도 못 잡는다. exitCode 는 CLI 진입점(require.main 블록)이 실제 종료 코드로 쓴다.
function fail(msg, code = 1) {
  const e = new Error(msg);
  e.exitCode = code;
  throw e;
}

function sha256(buf) { return 'sha256:' + crypto.createHash('sha256').update(buf).digest('hex'); }
// 셸 작은따옴표 인용. 백업 루트에 공백·$·"·백슬래시가 있어도 restore.sh 가 한 낱말로 넘긴다.
function shQuote(s) { return `'${String(s).replace(/'/g, `'\\''`)}'`; }
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

// undetermined[]: 판정할 수 없었던 항목을 삼키지 않고 호출자에게 돌려준다. detect는
// UNDETERMINED로 보고하고(항상 exit 0), backup은 매니페스트에서 빠진다는 사실을 경고로
// 드러낸다 — 조용한 누락이 가장 나쁜 결과다.
function collectTargets(root, undetermined = [], opts = {}) {
  const markers = opts.markers || SKILL_MARKERS;
  const targets = [];
  const dir = (rel) => { if (exists(path.join(root, rel))) targets.push({ rel, kind: 'dir' }); };
  const file = (rel) => { if (exists(path.join(root, rel))) targets.push({ rel, kind: 'file' }); };
  dir(VENDOR_DIR);
  for (const id of LEGACY_CAPABILITIES) dir(`.gsd/capabilities/${id}`);
  file(`.claude/hooks/${SHIP_GUARD}`);
  const skillsRoot = path.join(root, '.claude', 'skills');
  if (exists(skillsRoot)) {
    for (const e of fs.readdirSync(skillsRoot).sort()) {
      const d = path.join(skillsRoot, e);
      // statSync는 심볼릭 링크를 따라간다 — 사용자가 나중에 옮겨버린 저장소를 가리키는
      // dangling symlink 스킬은 완전히 평범한 상태인데, 여기서 던지면 "항상 exit 0"인
      // detect가 raw 스택으로 죽는다 (Task 9 Step 1이 그 종료 코드로 파괴 단계 진입을 정한다).
      let isDir;
      try { isDir = fs.statSync(d).isDirectory(); }
      catch (err) { undetermined.push(`.claude/skills/${e} (${err.code || err.message})`); continue; }
      if (isDir && markers.some((m) => exists(path.join(d, m)))) {
        targets.push({ rel: `.claude/skills/${e}`, kind: 'dir' });
      }
    }
  }
  file('CLAUDE.md');
  file('.claude/settings.json');
  return targets;
}

// 마커 쌍을 찾는 단일 술어. extractFragment(backup)와 restoreClaudeMd(restore)가 반드시
// 같은 판정을 써야 한다 — detect와 backup이 legacySignals를 공유하는 것과 같은 이유다.
// 어긋나면 backup이 뽑아낸 블록을 restore가 인식하지 못하는 상황이 생긴다.
function findMarkerRange(lines) {
  const start = lines.findIndex((l) => l.trim() === ROUTING_START);
  const end = lines.findIndex((l) => l.trim() === ROUTING_END);
  return { start, end };
}

// opts.tolerant: extractHookGroup과 같은 규약이다. ~/CLAUDE.md가 디렉터리이거나 읽을 수
// 없으면 detect는 { present:false, readError } 를 받아 UNDETERMINED로 보고하고 exit 0을
// 지킨다. backup은 1인자 호출로 loud fail(2) — 읽지 못한 파일을 두고 claudeMd.present:false
// 매니페스트를 쓰면 restore가 "백업에 fragment 없음"으로 알고 조용히 건너뛰는 거짓 백업이 된다.
function extractFragment(root, opts = {}) {
  const p = path.join(root, 'CLAUDE.md');
  if (!exists(p)) return { present: false };
  let text;
  try { text = fs.readFileSync(p, 'utf8'); }
  catch (err) {
    if (opts.tolerant) return { present: false, readError: err.message };
    fail(`~/CLAUDE.md could not be read: ${err.message}`, 2);
  }
  const lines = text.split('\n');
  const { start: s, end: e } = findMarkerRange(lines);
  if (s === -1 || e === -1 || e < s) return { present: false };
  const fragment = lines.slice(s, e + 1).join('\n') + '\n';
  return { present: true, startLine: s + 1, endLine: e + 1, fragment,
    fragmentSha256: sha256(Buffer.from(fragment)) };
}

// 훅 **하나**가 ship-guard 인지 보는 단일 술어. 그룹 판정(아래 hasShipGuardGroup)·복구의
// 재삽입(restoreSettings)·제거(scripts/uninstall-legacy.cjs)가 전부 이것 하나를 쓴다.
// 갈라지면 제거가 훅 단위로 빼낸 것을 복구가 그룹 단위로 되돌려, 그 그룹을 같이 쓰던
// 사용자 훅이 두 번 등록된다 (실제로 그랬다 — 최종 리뷰 I4).
function isShipGuardHook(h) {
  return String((h && h.command) || '').includes(SHIP_GUARD);
}
// ship-guard 훅 그룹인지 판정하는 단일 술어. extractHookGroup(backup)과
// restoreSettings(restore)가 반드시 같은 판정을 써야 한다 — legacySignals·findMarkerRange를
// 공유하는 것과 같은 이유다. 갈라지면 restore가 이미 있는 그룹을 못 알아보고 중복 훅 그룹을
// 덧붙인다.
function hasShipGuardGroup(g) {
  return Array.isArray(g && g.hooks) && g.hooks.some(isShipGuardHook);
}

// opts.tolerant: when the file exists but cannot be read or is not valid JSON,
// return a { present: true, group: null, readError|parseError } result instead of
// calling fail() and exiting. Only `detect` passes this — a judgment tool must never
// die on a hand-edited settings.json (design doc §1.2/§1.3, review round 1).
// `backup` calls this with no opts and keeps the loud fail(): a manifest that
// silently records hasHookGroup:false for a file it could not read or parse would be
// a false backup, and `restore` (Task 4-6) trusts that manifest.
//
// 읽기도 파싱과 같은 규약으로 감싼다. ~/.claude/settings.json 이 디렉터리이거나(EISDIR)
// 권한이 없으면(EACCES) 감싸지 않은 readFileSync 가 던져서 detect 가 exit 2 하고
// `legacy targets:` 줄 자체가 안 나온다 — extractFragment 는 이미 감싸져 있었는데
// 대칭 경로인 여기만 노출돼 있었다.
function extractHookGroup(root, opts = {}) {
  const p = path.join(root, '.claude', 'settings.json');
  if (!exists(p)) return { present: false };
  let raw;
  try { raw = fs.readFileSync(p); }
  catch (err) {
    if (opts.tolerant) return { present: true, group: null, readError: err.message };
    fail(`~/.claude/settings.json could not be read: ${err.message}`, 2);
  }
  let parsed;
  try { parsed = JSON.parse(raw.toString('utf8')); }
  catch (err) {
    if (opts.tolerant) return { present: true, sha256: sha256(raw), group: null, parseError: true };
    fail(`~/.claude/settings.json is not valid JSON: ${err.message}`, 2);
  }
  const pre = parsed && parsed.hooks && parsed.hooks.PreToolUse;
  const groups = Array.isArray(pre) ? pre.filter(hasShipGuardGroup) : [];
  if (groups.length > 1) fail(`unexpected: ${groups.length} ship-guard hook groups in settings.json`, 2);
  return { present: true, sha256: sha256(raw), group: groups[0] || null };
}

// "레거시가 설치돼 있는가"의 판정. 파일 존재가 아니라 **Triple Crown이 심은 것**을 센다.
// ~/.claude/settings.json은 Claude Code가 깔린 거의 모든 머신에 있다 — 그걸 세면 레거시를
// 설치한 적 없는 PC에서도 0이 안 나오고, Task 9의 "0이면 스킵" 분기가 영영 안 걸린다.
function legacySignals(root, targets, frag, hook) {
  const owned = targets.filter((t) => !SEMANTIC.has(t.rel));
  return {
    owned,
    count: owned.length + (frag.present ? 1 : 0) + (hook.present && hook.group ? 1 : 0),
  };
}

function backup(opts) {
  // 루트 일반화: --root 가 있으면 프로젝트 트리, 없으면 지금까지처럼 $HOME. scope 는
  // 매니페스트에 남아 restore --root 없이 재생될 때 어느 종류의 백업인지 알려준다.
  const root = opts.root ? path.resolve(opts.root) : os.homedir();
  const scope = opts.root ? 'project' : 'home';
  // 기본 dest 는 스코프를 접는다. 접지 않으면 `backup --root <proj>` 와 `backup` 이 같은
  // 기본 경로를 두고 다투고, 두 번째가 "이미 비어 있지 않다"로 막힌다 — bin/crew.cjs 가
  // 스코프마다 정확히 그 두 명령을 찍어 주므로, 도구 자신의 안내를 따라 --global 흐름을
  // 밟는 사용자가 두 번째 단계에서 멈춘다(R7, 최종 리뷰 I5). 홈 스코프의 경로는 설계 §2.1
  // 런북과 같은 `<YYYY-MM-DD>` 그대로 둔다 — 그 경로를 적어 둔 문서와 테스트가 있다.
  const dest = opts.dest || path.join(os.homedir(), '.crew-legacy-backup',
    scope === 'project' ? `${localDate()}-${path.basename(root) || 'root'}` : localDate());
  if (exists(dest) && fs.readdirSync(dest).length) {
    fail(`backup destination already exists and is not empty: ${dest}`, 2);
  }
  const undetermined = [];
  const targets = collectTargets(root, undetermined);
  const frag = extractFragment(root);
  const hook = extractHookGroup(root);
  // 판정하지 못한 항목은 매니페스트에서 빠진다 — 조용히 빠뜨리지 않고 밝힌다.
  for (const u of undetermined) log(`WARNING: could not inspect ~/${u} — not included in this backup`);
  // 판정은 detect와 같은 술어를 쓴다. stock settings.json 하나만 있는 홈을 "백업했다"고
  // 말하면 그게 가장 위험한 거짓 안심이다.
  if (!legacySignals(root, targets, frag, hook).count) {
    fail('nothing to back up: no legacy installation found', 2);
  }
  const files = [];
  for (const t of targets) walkFiles(path.join(root, t.rel), t.rel, files);

  fs.mkdirSync(dest, { recursive: true });
  const tar = cp.spawnSync('tar',
    ['-czf', path.join(dest, 'archive.tar.gz'), '-C', root, '--', ...targets.map((t) => t.rel)],
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
    home: root,               // 이 백업을 뜬 루트. 키 이름은 하위 호환으로 유지한다
    scope,                    // 'home' | 'project'
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
  // 프로젝트 백업의 자급식 복구 스크립트는 자기 루트를 박아 두어야 한다. --root 없는
  // restore 는 os.homedir() 를 대상으로 삼으므로, 그 없이는 이 스크립트가 프로젝트의
  // 개명 전 설치본을 $HOME 에 쏟는다 — 설계 §2.1 의 "백업만으로 복구 가능" 불변식이
  // 정확히 거기서 깨진다(최종 리뷰 C1). "$@" 가 뒤에 오므로 사용자가 --root 를 직접
  // 넘기면 그쪽이 이긴다(parseArgs 는 마지막 값을 쓴다).
  const rootArg = scope === 'project' ? ` --root ${shQuote(root)}` : '';
  fs.writeFileSync(path.join(dest, 'restore.sh'),
    '#!/usr/bin/env bash\nset -euo pipefail\nHERE="$(cd "$(dirname "$0")" && pwd -P)"\n' +
    `exec node "$HERE/legacy-backup.cjs" restore --from "$HERE"${rootArg} "$@"\n`,
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
  // CLAUDE.md.fragment와 settings.json.hookgroup은 archive.tar.gz **밖**에 있고
  // manifest.files는 tar 내용만 담는다 — 위 루프는 이 둘을 절대 보지 않는다. 그 공백 때문에
  // 둘 중 하나가 없거나 손상된 백업도 "verify OK"를 받았고, 그 직후 restore가 홈을 교체한
  // 다음 그 파일을 읽다 죽었다. restore가 쓰는 모든 입력을 verify가 본다는 것이 이 명령의 뜻이다.
  if (manifest.claudeMd && manifest.claudeMd.present) {
    const fp = path.join(from, 'CLAUDE.md.fragment');
    let buf = null;
    try { buf = fs.readFileSync(fp); }
    catch (err) { problems.push(`unusable side file: CLAUDE.md.fragment (${err.message})`); }
    if (buf && manifest.claudeMd.fragmentSha256 && sha256(buf) !== manifest.claudeMd.fragmentSha256) {
      problems.push('sha256 mismatch: CLAUDE.md.fragment');
    }
  }
  if (manifest.settings && manifest.settings.hasHookGroup) {
    try { readJson(path.join(from, 'settings.json.hookgroup')); }
    catch (err) { problems.push(`unusable side file: settings.json.hookgroup (${err.message})`); }
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
  if (!manifest.claudeMd.present) { actions.push('CLAUDE.md: no fragment in backup — skip'); return; }
  const p = path.join(home, 'CLAUDE.md');
  const fragment = fs.readFileSync(path.join(from, 'CLAUDE.md.fragment'), 'utf8');
  if (!exists(p)) {
    actions.push('CLAUDE.md: missing — create with fragment');
    if (!dryRun) fs.writeFileSync(p, fragment);
    return;
  }
  const text = fs.readFileSync(p, 'utf8');
  const lines = text.split('\n');
  const { start: s, end: e } = findMarkerRange(lines);
  const properPair = s !== -1 && e !== -1 && s < e;
  const malformed = ((s === -1) !== (e === -1)) || (s !== -1 && e !== -1 && e < s);
  if (properPair) {
    actions.push('CLAUDE.md: marker block already present — no-op');
    return;
  }
  if (malformed) {
    let where;
    if (s !== -1 && e !== -1) {
      where = `end marker found at line ${e + 1} before the start marker at line ${s + 1}`;
    } else if (s !== -1) {
      where = `only the start marker was found, at line ${s + 1} — no matching end marker`;
    } else {
      where = `only the end marker was found, at line ${e + 1} — no matching start marker`;
    }
    const status = dryRun
      ? 'this was a dry run — nothing was written to CLAUDE.md.'
      : 'the restoreOrder targets (directories/files) were already restored successfully; ' +
        'only ~/CLAUDE.md was left untouched.';
    fail(`CLAUDE.md has a malformed managed-routing marker: ${where}. ${status} ` +
      `Fix the marker pair by hand in ~/CLAUDE.md (or remove both markers and re-run restore).`, 2);
  }
  if (manifest.claudeMd.startLine === 1) {
    actions.push('CLAUDE.md: prepend fragment (original position: line 1)');
    if (!dryRun) fs.writeFileSync(p, fragment + text);
  } else {
    actions.push('CLAUDE.md: append fragment');
    if (!dryRun) fs.writeFileSync(p, text.replace(/\n?$/, '\n') + fragment);
  }
}

// settings.json은 CLAUDE.md와 같은 "일부 구간만 소유" 대상이다 (SEMANTIC, restoreOrder 제외).
// sha256이 백업 시점과 같으면 통째로 되돌려도 안전하다. 다르면 사용자가 다른 훅/키를 추가했을
// 수 있으므로 절대 덮어쓰지 않고, ship-guard 그룹의 존재를 술어로 재삽입만 시도한다 — 배열의
// 다른 원소도, 다른 키도 손대지 않고 인덱스도 참조하지 않는다. 재삽입이 안전하다고 판단할 수
// 없으면(파싱 실패, 또는 존재하는 hooks/hooks.PreToolUse의 타입 불일치) exit 3으로 멈추고 자동
// 쓰기를 하지 않는다 — 이건 "부분 실패"가 아니라 정의된 상태다: restoreOrder 대상(벤더 트리·
// capability·훅 파일·마킹된 스킬)과 CLAUDE.md 처리는 이미 끝났고, settings.json 하나만 수동
// 병합을 기다린다. 그 두 사실을 메시지가 다 말해야 하고(§2.5.1), trackActions 덕분에 롤백
// 디렉터리 안내도 이 exit에서 함께 살아남는다.
function restoreSettings(home, tmp, from, manifest, actions, dryRun) {
  if (!manifest.settings.present) { actions.push('settings.json: not in backup — skip'); return; }
  const dst = path.join(home, '.claude', 'settings.json');
  const backupRaw = fs.readFileSync(path.join(tmp, '.claude', 'settings.json'));
  if (!exists(dst)) {
    actions.push('settings.json: missing — restore full file from backup');
    if (!dryRun) { fs.mkdirSync(path.dirname(dst), { recursive: true }); fs.writeFileSync(dst, backupRaw); }
    return;
  }
  const currentRaw = fs.readFileSync(dst);
  if (sha256(currentRaw) === manifest.settings.sha256) {
    actions.push('settings.json: unchanged since backup — full restore is safe');
    if (!dryRun) fs.writeFileSync(dst, backupRaw);
    return;
  }
  if (!manifest.settings.hasHookGroup) {
    actions.push('settings.json: changed since backup, no hook group to reinsert — leaving as is');
    return;
  }
  const already = dryRun
    ? 'this was a dry run — no restoreOrder targets and no settings.json bytes were written.'
    : 'the restoreOrder targets (vendor tree, capabilities, hook file, marked skills) are already ' +
      'restored; only ~/.claude/settings.json is left, awaiting a manual merge.';
  const manual = `settings.json changed since backup and cannot be merged automatically — no automatic ` +
    `write was performed to it. ${already} Reinsert the group from ` +
    `${path.join(from, 'settings.json.hookgroup')} into hooks.PreToolUse manually, or resolve the ` +
    `conflict and re-run restore.`;
  let parsed;
  try { parsed = JSON.parse(currentRaw.toString('utf8')); }
  catch (err) { fail(`${manual} (parse error: ${err.message})`, 3); }
  if (parsed.hooks !== undefined && (typeof parsed.hooks !== 'object' || parsed.hooks === null)) fail(manual, 3);
  if (parsed.hooks && parsed.hooks.PreToolUse !== undefined && !Array.isArray(parsed.hooks.PreToolUse)) {
    fail(manual, 3);
  }
  // 제거가 컨테이너까지 지우고 갔는지 기억해 둔다 — 아래에서 자리까지 되살리기 위해서다.
  const hadHooks = parsed.hooks !== undefined;
  const hadPre = !!(parsed.hooks && parsed.hooks.PreToolUse !== undefined);
  parsed.hooks = parsed.hooks || {};
  parsed.hooks.PreToolUse = parsed.hooks.PreToolUse || [];
  const present = parsed.hooks.PreToolUse.some(hasShipGuardGroup);
  if (present) { actions.push('settings.json: ship-guard group already present — no-op'); return; }
  const group = readJson(path.join(from, 'settings.json.hookgroup'));
  // 제거는 훅 단위다 — 가드 훅만 빼내고 같은 그룹의 사용자 훅은 남긴다. 복구도 훅 단위여야
  // 왕복이 제자리로 온다: 그룹째 다시 붙이면 그룹에 남아 있던 사용자 훅이 사본으로 함께
  // 따라와 Bash 호출마다 두 번 돈다(최종 리뷰 I4 의 실측이 정확히 이 모양이다). 백업된
  // 그룹에서 가드 훅을 뺀 나머지와 **정확히 같은** 그룹이 지금 있으면 그것이 제거가 남긴
  // 잔해이므로, 원래 인덱스 그대로 가드 훅을 도로 끼워 넣는다. 나머지가 비어 있으면
  // (가드가 그룹의 전부였으면) 제거가 그룹째 들어냈으므로 예전처럼 그룹을 덧붙인다.
  const guardIdx = [];
  const remainder = [];
  (Array.isArray(group.hooks) ? group.hooks : []).forEach((h, i) => {
    if (isShipGuardHook(h)) guardIdx.push(i); else remainder.push(h);
  });
  const host = remainder.length
    ? parsed.hooks.PreToolUse.find((g) => g && g.matcher === group.matcher &&
        Array.isArray(g.hooks) && isDeepStrictEqual(g.hooks, remainder))
    : null;
  if (host) {
    for (const i of guardIdx) host.hooks.splice(i, 0, group.hooks[i]);
    actions.push('settings.json: reinserted the ship-guard hook into the group it was removed from');
  } else {
    parsed.hooks.PreToolUse.push(group);
    actions.push('settings.json: reinserted ship-guard hook group (predicate match, appended)');
  }
  // 제거가 비워서 지운 컨테이너를 되살릴 때는 자리까지 되살린다. JSON.stringify 는 키 삽입
  // 순서를 그대로 쓰므로 `parsed.hooks = {}` 로 새로 만들면 백업에서 첫 키였던 hooks 가 파일
  // 끝으로 밀린다 — 가드 훅이 유일한 훅이었던 흔한 트리(제거가 빈 hooks 를 지우고 간다)에서
  // 바로 그 이유로 왕복이 바이트 동일에서 어긋났다. 되살린 키 하나만 제자리에 끼운다.
  const template = parseOrNull(backupRaw);
  if (!hadPre) parsed.hooks = reviveKeyAt(parsed.hooks, 'PreToolUse', template && template.hooks);
  if (!hadHooks) parsed = reviveKeyAt(parsed, 'hooks', template);
  if (!dryRun) fs.writeFileSync(dst, JSON.stringify(parsed, null, 2) + '\n');
}

function parseOrNull(buf) { try { return JSON.parse(buf.toString('utf8')); } catch { return null; } }
// obj 의 key 를 template 이 그 키를 두었던 자리로 옮긴다. 나머지 키의 상대 순서는 그대로다.
function reviveKeyAt(obj, key, template) {
  if (!template || typeof template !== 'object' || !(key in template)) return obj;
  const want = Object.keys(template).indexOf(key);
  const rest = Object.keys(obj).filter((k) => k !== key);
  const out = {};
  for (const k of rest.slice(0, want)) out[k] = obj[k];
  out[key] = obj[key];
  for (const k of rest.slice(want)) out[k] = obj[k];
  return out;
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
    // manifest.scope 의 소비처. 프로젝트 트리에서 뜬 백업은 "다른 홈의 백업"이 아니라
    // "홈이 아닌 곳의 백업"이고, 정답은 --allow-foreign-home 이 아니라 --root 다. 여기서
    // --allow-foreign-home 을 권하면 사용자가 프로젝트의 개명 전 설치본을 $HOME 에 쏟아
    // 머신 전역 ship guard 를 다시 무장시킨다 — 이 마일스톤의 비대칭 기본값(D13)이 막으려던
    // 바로 그 모양이다. scope 가 없는 옛 백업은 아래 홈 스코프 메시지를 그대로 받는다.
    if (manifest.scope === 'project') {
      fail(`this backup was taken from a project tree, not from a home ` +
        `(manifest.home=${manifest.home}, current restore root=${home}). Restore it into that ` +
        `tree: add --root ${manifest.home}. Do not pass --allow-foreign-home here — that would ` +
        `write the project's Triple Crown installation into this home instead.`, 4);
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
  // 롤백 디렉터리는 첫 '교체'가 실제로 일어날 때 만든다. 미리 만들면 교체 대상이 하나도 없는
  // restore도 실제 $HOME에 빈 ~/.crew-legacy-rollback-XXXXXX를 남기고 "replaced targets
  // kept..."라는 거짓 안내까지 찍었다 — 반복 실행하면 홈에 계속 쌓인다.
  let rollback = null;
  const ensureRollback = () => (rollback = rollback || fs.mkdtempSync(path.join(home, '.crew-legacy-rollback-')));
  const moved = [];
  const created = [];
  // dst -> actions[] 안에서 그 대상의 overwrite:/create: 줄 인덱스. 복사가 실제로 끝난 대상만
  // 등록한다. 실패로 그 대상이 롤백되면 이 인덱스로 줄을 다시 지운다 — 리뷰 지적: 대상별로
  // 미리 찍어두면, 나중에 그 대상만 롤백돼도 stdout이 "썼다"고 계속 거짓을 말하게 된다.
  const actionIndexByDst = new Map();
  try {
    for (const rel of restoreOrder) {
      const dst = path.join(home, rel);
      const wasPresent = exists(dst);
      if (wasPresent) {
        const saved = path.join(ensureRollback(), rel);
        fs.mkdirSync(path.dirname(saved), { recursive: true });
        fs.renameSync(dst, saved);                 // $HOME 내부 — cross-device 아님
        moved.push({ dst, saved });
      } else {
        created.push(dst);                          // 시작 상태에 없던 대상 — 실패 시 지워야 홈이 그대로다
      }
      fs.mkdirSync(path.dirname(dst), { recursive: true });
      // verbatimSymlinks 기본값(false)은 상대 링크를 **원본 기준 절대경로**로 다시 쓴다.
      // 여기서 원본은 finally 에서 지워지는 임시 추출 디렉터리이므로, 그대로 두면 복원된
      // 링크가 곧바로 없는 경로를 가리킨다 — verify 는 아카이브만 보므로 "verify OK" 뒤에
      // 조용히 깨진다. walkFiles 가 링크를 kind:'symlink' 로 충실히 기록하는 이상,
      // 복원도 문자 그대로여야 한다.
      fs.cpSync(path.join(tmp, rel), dst, { recursive: true, verbatimSymlinks: true });
      // 이 대상은 복사가 실제로 끝난 뒤에만 로그한다 (리뷰 지적 — 미리 찍어두지 않는다).
      actions.push(`${wasPresent ? 'overwrite' : 'create'}: ~/${rel}`);
      actionIndexByDst.set(dst, actions.length - 1);
    }
  } catch (err) {
    // 롤백은 항목 단위로 최선을 다한다 — 하나가 막혀도(:rmSync/:renameSync) 나머지 시도를
    // 멈추지 않는다. 안 그러면 막힌 항목 하나 때문에 멀쩡히 되돌아왔을 나머지까지 전부
    // 방치된다. dirname을 되돌리기 직전에 다시 만드는 건, created 정리가 moved 항목의 부모
    // 디렉터리를 먼저 지웠을 수 있기 때문이다 (중첩된 매니페스트 항목의 경우).
    for (const dst of created.reverse()) {
      try { fs.rmSync(dst, { recursive: true, force: true }); } catch { /* best effort — 아래서 확인 */ }
    }
    for (const m of moved.reverse()) {
      try {
        fs.mkdirSync(path.dirname(m.dst), { recursive: true });
        fs.rmSync(m.dst, { recursive: true, force: true });
        fs.renameSync(m.saved, m.dst);
      } catch { /* best effort — 아래서 확인 */ }
    }
    const unrestored = moved.filter((m) => exists(m.saved)).map((m) => m.dst);
    const notCleaned = created.filter((dst) => exists(dst));

    // 되돌리는 데 성공한 대상은 더 이상 "overwrite/create"가 아니다 — 찍어둔 줄을 지운다.
    // 되돌리지 못한 대상(unrestored/notCleaned)만 실제로 여전히 덮어써진 상태이므로 남긴다.
    const stillWritten = new Set([...unrestored, ...notCleaned]);
    const toRetract = [...actionIndexByDst.entries()]
      .filter(([dst]) => !stillWritten.has(dst))
      .map(([, idx]) => idx)
      .sort((a, b) => b - a);            // 뒤에서부터 splice해야 앞쪽 인덱스가 안 밀린다
    for (const idx of toRetract) actions.splice(idx, 1);

    if (unrestored.length || notCleaned.length) {
      // 계약 3의 보장은 무조건이므로, 전부 되돌리지 못했을 땐 최소한 롤백 디렉터리 경로와
      // 아직 못 되돌린 항목을 알려야 한다 — 사용자가 직접 복구할 수 있게.
      fail(`restore failed (${err.message}), and the automatic rollback could not fully complete.` +
        (rollback ? ` Your original files are preserved at ${rollback} — do not delete it.` : '') +
        (unrestored.length ? ` Not yet restored from there: ${unrestored.join(', ')}.` : '') +
        (notCleaned.length ? ` Not yet cleaned up: ${notCleaned.join(', ')}.` : '') +
        ` Restore by hand, then investigate before retrying.`, 2);
    }
    if (rollback) {
      try { fs.rmSync(rollback, { recursive: true, force: true }); } catch { /* 비어 있음 — 남아도 무해 */ }
    }
    fail(`restore failed (${err.message}) — rolled back, home is unchanged`, 2);
  }
  // 교체가 하나도 없었으면 보관할 원본도 없다 — 안내를 찍지 않는다.
  if (rollback) {
    actions.push(`replaced targets kept for rollback at ~/${path.basename(rollback)} (delete when satisfied)`);
  }
}

function restore(opts) {
  // R2: 이 한 줄이 restore 전체의 루트를 정한다. 아래 7곳(assertRestoreHome, 탈출 검사,
  // 로그, applyRestore, restoreClaudeMd, restoreSettings)은 이 home 을 그대로 따라간다 —
  // 개별로 고치지 않는다. --root 가 없으면 지금까지처럼 $HOME.
  const home = opts.root ? path.resolve(opts.root) : os.homedir();
  if (!opts.from) fail('--from <backup dir> is required', 2);
  const { manifest, problems } = verifyArchive(opts.from);   // 설계 §2.5 1단계
  if (problems.length) {
    for (const p of problems) log(`FAIL ${p}`);
    fail('archive does not match MANIFEST.json — aborting restore', 2);
  }
  assertRestoreHome(home, manifest, opts.allowForeignHome);   // 안전 계약 1 — 쓰기 전, dry-run도 동일
  const tmp = extractArchive(opts.from);
  const actions = [];
  // applyRestore() 이후 fail()로 빠지는 경로(Task 5의 malformed CLAUDE.md 마커, Task 6의
  // settings.json exit 3)도 여기까지 쌓인 안내를 잃지 않도록 등록해 둔다 — 위 fail() 정의 참고.
  trackActions(actions, opts.dryRun);
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
    // 안전 계약 2는 restoreOrder만이 아니라 **복구가 읽을 모든 입력**에 걸린다. 이 두 파일은
    // tar 밖에 있어서 위 루프가 보지 못한다 — 여기서 안 막으면 restoreClaudeMd/restoreSettings의
    // readFileSync가 홈을 이미 교체한 뒤에 던진다. (verifyArchive도 같은 검사를 하므로 실전에선
    // 그쪽이 먼저 잡는다. 계약이 걸린 지점 자체에 검사를 두는 것이 이 루프의 목적이다 —
    // 검증 단계를 건너뛰거나 순서가 바뀌어도 쓰기 전에 멈춘다.)
    const unusable = [];
    if (manifest.claudeMd && manifest.claudeMd.present) {
      try { fs.readFileSync(path.join(opts.from, 'CLAUDE.md.fragment'), 'utf8'); }
      catch (err) { unusable.push(`CLAUDE.md.fragment (${err.message})`); }
    }
    if (manifest.settings && manifest.settings.hasHookGroup) {
      try { readJson(path.join(opts.from, 'settings.json.hookgroup')); }
      catch (err) { unusable.push(`settings.json.hookgroup (${err.message})`); }
    }
    if (unusable.length) {
      fail(`backup is missing restore inputs: ${unusable.join(', ')} — nothing was changed`, 2);
    }
    if (opts.dryRun) {
      // dry-run에서는 applyRestore()가 아예 실행되지 않으므로 여기서 "예정된" 줄을 미리 찍는다 —
      // 예측이라고 [dry-run] 접두어가 이미 붙어 있으므로 미리 나열해도 진실과 어긋나지 않는다.
      for (const rel of manifest.restoreOrder) {
        actions.push(`${exists(path.join(home, rel)) ? 'overwrite' : 'create'}: ~/${rel}`);
      }
    } else {
      // 실쓰기 경로: 각 대상이 실제로 복사를 마친 시점에만 applyRestore()가 그 줄을 찍는다 —
      // 미리 찍어두면 중간 실패로 롤백된 대상까지 "썼다"고 stdout이 거짓을 말하게 된다(리뷰 지적).
      applyRestore(home, tmp, manifest.restoreOrder, actions);
    }
    restoreClaudeMd(home, opts.from, manifest, actions, opts.dryRun);
    restoreSettings(home, tmp, opts.from, manifest, actions, opts.dryRun);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  untrackActions();
  for (const a of actions) log((opts.dryRun ? '[dry-run] ' : '') + a);
  if (opts.dryRun) { log('dry-run: no writes performed'); return; }
  log('restore complete. Verify capability registrations with: gsd-tools capability list');
}

// 판정용 — 이 머신에 실제로 뭐가 있는지만 보고한다. 부재는 오류가 아니므로 항상 exit 0.
// Task 9 런북이 파괴적 단계로 갈지 말지를 이 출력 하나로 결정한다.
function detect(opts) {
  const root = opts.root ? path.resolve(opts.root) : os.homedir();
  const undetermined = [];
  const targets = collectTargets(root, undetermined);
  const frag = extractFragment(root, { tolerant: true });
  const hook = extractHookGroup(root, { tolerant: true });
  const { owned, count } = legacySignals(root, targets, frag, hook);
  // 라벨 `home: ` 은 그대로 둔다 — e2e/contract/legacy-backup.test.cjs:91 이 이 문자열을
  // 소비한다. 값만 root 로 바뀐다 (홈 스코프에서는 root === os.homedir() 이라 동일하다).
  log(`home: ${root}`);
  for (const t of owned) log(`  owned  ${t.kind === 'dir' ? 'dir ' : 'file'} ~/${t.rel}`);
  for (const u of undetermined) log(`  UNDETERMINED  ~/${u}`);
  if (frag.readError) {
    log(`  CLAUDE.md routing marker: UNDETERMINED (unreadable: ${frag.readError})`);
  } else {
    log(`  CLAUDE.md routing marker: ${frag.present ? `lines ${frag.startLine}-${frag.endLine}` : 'absent'}`);
  }
  if (hook.readError) {
    log(`  settings.json ship-guard group: UNDETERMINED (unreadable: ${hook.readError})`);
  } else if (hook.parseError) {
    log('  settings.json ship-guard group: UNDETERMINED (not valid JSON)');
  } else {
    log(`  settings.json ship-guard group: ${hook.present && hook.group ? 'present' : 'absent'}`);
  }
  // Task 9 의 "제거할 것 없음" 분기는 `legacy targets: 0` 하나만 봐서는 안 된다 —
  // UNDETERMINED 는 "없다"가 아니라 "모른다"다. 판정 불가 항목만 있는 홈에서도 count 는
  // 0 이므로, 그 분기가 조용히 통과해 실제로 남아 있는 레거시를 놓친다. 단어를 grep 하는
  // 것으로는 부족하다 (경로 이름에 들어 있으면 거짓 양성). 세어서 한 줄로 낸다.
  const undeterminedCount = undetermined.length +
    (frag.readError ? 1 : 0) + (hook.readError || hook.parseError ? 1 : 0);
  log(`undetermined: ${undeterminedCount}`);
  log(`legacy targets: ${count}`);
}

function parseArgs(argv) {
  const out = { command: argv[0], dest: null, from: null, root: null, dryRun: false, allowForeignHome: false };
  const rest = argv.slice(1);
  while (rest.length) {
    const a = rest.shift();
    if (a === '--dest') out.dest = rest.shift() || fail('--dest requires a path', 2);
    else if (a === '--from') out.from = rest.shift() || fail('--from requires a path', 2);
    else if (a === '--root') out.root = rest.shift() || fail('--root requires a path', 2);
    else if (a === '--dry-run') out.dryRun = true;
    else if (a === '--allow-foreign-home') out.allowForeignHome = true;
    else fail(`unknown option: ${a}`, 2);
  }
  return out;
}

module.exports = {
  ROUTING_START, ROUTING_END, SHIP_GUARD,
  LEGACY_CAPABILITIES, SKILL_MARKERS, LEGACY_SKILL_MARKERS, SEMANTIC, VENDOR_DIR,
  collectTargets, findMarkerRange, extractFragment,
  isShipGuardHook, hasShipGuardGroup, extractHookGroup, legacySignals, verifyArchive,
};

// CLI 로 직접 실행될 때만 전역 상태를 건드린다. bin/crew.cjs 가 이 파일을 require 하므로
// 최상위에서 uncaughtException 을 잡으면 설치자 전체의 오류 계약(`Crew installer: …`,
// exit err.exitCode||1)이 이 파일의 것(`legacy-backup: …`, exit 2)으로 바뀐다.
// argv 파싱도 마찬가지다 — require 시점에 crew.cjs 의 `--project` 를 보고 죽는다.
if (require.main === module) {
  // 마지막 그물. flushPendingActions()는 fail() 안에서만 도는데, 네이티브 예외
  // (EISDIR/ENOENT/EACCES…)는 fail()을 거치지 않고 프로세스를 끝낸다 — 그러면 exit 1
  // (계약은 2)에 stdout은 비어 있고, 원본을 옮겨둔 ~/.crew-legacy-rollback-XXXXXX
  // 위치가 어디에도 안 나온다. 홈을 이미 교체한 뒤라면 그게 유일한 단서다. fail() 이
  // throw 로 바뀌었으므로(R1) 여기서도 명시적으로 flush·cleanup 한 뒤 종료 코드를 살린다.
  process.on('uncaughtException', (e) => {
    flushPendingActions();
    cleanup();
    process.stderr.write(`legacy-backup: ${(e && e.message) || e}\n`);
    process.exit((e && e.exitCode) || 2);
  });

  const opts = parseArgs(process.argv.slice(2));
  if (opts.command === 'detect') detect(opts);            // Task 3 — 여기서 빠뜨리면 Task 9 Step 1이 죽는다
  else if (opts.command === 'backup') backup(opts);
  else if (opts.command === 'verify') verify(opts);
  else if (opts.command === 'restore') restore(opts);
  else fail('usage: legacy-backup.cjs detect [--root DIR] | backup [--root DIR] [--dest DIR] | ' +
    'verify --from DIR | restore --from DIR [--root DIR] [--dry-run] [--allow-foreign-home]', 2);
}
