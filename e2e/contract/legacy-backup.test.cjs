'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const { mkFakeHome, runBackupTool, CAPABILITIES } = require('./helpers/fake-home.cjs');

test('backup captures all legacy targets into manifest + archive', () => {
  const home = mkFakeHome();
  const dest = path.join(home, 'backup');
  const r = runBackupTool(['backup', '--dest', dest], { HOME: home });
  assert.strictEqual(r.status, 0, r.stderr);

  const manifest = JSON.parse(fs.readFileSync(path.join(dest, 'MANIFEST.json'), 'utf8'));
  const rels = manifest.targets.map((t) => t.rel);
  assert.ok(rels.includes('.triple-crown'));
  for (const id of CAPABILITIES) assert.ok(rels.includes(`.gsd/capabilities/${id}`), id);
  assert.ok(rels.includes('.claude/hooks/triple-crown-ship-guard.cjs'));
  assert.ok(rels.includes('.claude/skills/gsd-triple-crown'));
  assert.ok(rels.includes('CLAUDE.md'));
  assert.ok(rels.includes('.claude/settings.json'));

  assert.strictEqual(manifest.claudeMd.present, true);
  assert.strictEqual(manifest.claudeMd.startLine, 1);
  assert.strictEqual(manifest.settings.hasHookGroup, true);
  assert.ok(manifest.files.some((f) => f.kind === 'file' && f.sha256.startsWith('sha256:')));

  const frag = fs.readFileSync(path.join(dest, 'CLAUDE.md.fragment'), 'utf8');
  assert.ok(frag.startsWith('<!-- triple-crown:managed-routing:start -->'));
  assert.ok(frag.trimEnd().endsWith('<!-- triple-crown:managed-routing:end -->'));

  const group = JSON.parse(fs.readFileSync(path.join(dest, 'settings.json.hookgroup'), 'utf8'));
  assert.strictEqual(group.matcher, 'Bash');
  assert.match(group.hooks[0].command, /triple-crown-ship-guard\.cjs/);

  assert.ok(fs.existsSync(path.join(dest, 'archive.tar.gz')));
  assert.ok(fs.existsSync(path.join(dest, 'legacy-backup.cjs')));
  assert.ok(fs.statSync(path.join(dest, 'restore.sh')).mode & 0o100, 'restore.sh must be executable');
});

test('backup refuses a non-empty destination and an empty home', () => {
  const home = mkFakeHome();
  const dest = path.join(home, 'backup');
  fs.mkdirSync(dest, { recursive: true });
  fs.writeFileSync(path.join(dest, 'existing'), 'x');
  const r = runBackupTool(['backup', '--dest', dest], { HOME: home });
  assert.notStrictEqual(r.status, 0);

  const emptyHome = fs.mkdtempSync(path.join(require('os').tmpdir(), 'crew-empty-'));
  const r2 = runBackupTool(['backup', '--dest', path.join(emptyHome, 'b')], { HOME: emptyHome });
  assert.notStrictEqual(r2.status, 0);
  assert.match(r2.stderr, /nothing to back up/i);
});

test('detect reports the inventory of any home and never fails on an absent install', () => {
  // 레거시가 설치된 적 없는 PC — Task 9가 여기서 막히면 안 된다.
  const emptyHome = fs.mkdtempSync(path.join(require('os').tmpdir(), 'crew-empty-'));
  const empty = runBackupTool(['detect'], { HOME: emptyHome });
  assert.strictEqual(empty.status, 0, empty.stderr);
  assert.match(empty.stdout, /^legacy targets: 0$/m);

  // Claude Code만 깔린 평범한 홈 — 사용자 파일이 있다고 레거시로 세면 안 된다.
  // (파일 존재로 세던 초안은 이 홈에서 1을 반환해 Task 9의 스킵 분기를 죽였다.)
  fs.mkdirSync(path.join(emptyHome, '.claude'), { recursive: true });
  fs.writeFileSync(path.join(emptyHome, '.claude/settings.json'),
    JSON.stringify({ hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'other.cjs' }] }] } }, null, 2));
  fs.writeFileSync(path.join(emptyHome, 'CLAUDE.md'), '# my own notes\n');
  const stock = runBackupTool(['detect'], { HOME: emptyHome });
  assert.strictEqual(stock.status, 0, stock.stderr);
  assert.match(stock.stdout, /^legacy targets: 0$/m, 'user-owned files are not a legacy install');
  // 같은 술어를 공유하므로 backup도 여기서 거부해야 한다.
  const b = runBackupTool(['backup', '--dest', path.join(emptyHome, 'b')], { HOME: emptyHome });
  assert.notStrictEqual(b.status, 0);
  assert.match(b.stderr, /nothing to back up/i);

  // 레거시가 설치된 PC — 같은 명령이 실제 인벤토리를 센다.
  const home = mkFakeHome();
  const full = runBackupTool(['detect'], { HOME: home });
  assert.strictEqual(full.status, 0, full.stderr);
  const n = Number(full.stdout.match(/^legacy targets: (\d+)$/m)[1]);
  assert.ok(n > 0, `fake home must report targets, got ${n}`);
  assert.match(full.stdout, new RegExp(`^home: ${home}$`, 'm'));
});

test('default backup directory uses the local date, not the UTC date', () => {
  // UTC+14 / UTC-12 두 시간대는 서로 1~2일 차이나므로, 어느 순간에 실행해도
  // 최소 한쪽은 UTC 날짜와 다르다 — toISOString().slice(0,10) 구현이면 반드시 깨진다.
  for (const tz of ['Pacific/Kiritimati', 'Etc/GMT+12']) {
    const home = mkFakeHome();
    const r = runBackupTool(['backup'], { HOME: home, TZ: tz });
    assert.strictEqual(r.status, 0, r.stderr);

    // 같은 TZ에서 `date +%F`와 동일한 값 (Node는 TZ 환경변수를 존중한다)
    const expected = cp.execFileSync(process.execPath, ['-e',
      'const d=new Date(),p=(n)=>String(n).padStart(2,"0");' +
      'process.stdout.write(`${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`);'],
      { encoding: 'utf8', env: { ...process.env, TZ: tz } });

    assert.deepStrictEqual(fs.readdirSync(path.join(home, '.crew-legacy-backup')), [expected],
      `TZ=${tz}: default dest must match local date`);
    assert.match(r.stdout, new RegExp(`backup complete: .*${expected}`),
      'stdout must print the actual dest so the runbook can reuse it');
  }
});

test('detect tolerates a corrupted settings.json (exit 0, UNDETERMINED) while backup still refuses it', () => {
  // 손상된 settings.json은 detect가 살아남아야 하는 바로 그 미지 상태다 — 반쯤 고친
  // 설정 파일을 가진 머신에서도 Task 9의 런북은 detect의 exit code로 진행 여부를 정한다.
  const home = fs.mkdtempSync(path.join(require('os').tmpdir(), 'crew-corrupt-'));
  fs.mkdirSync(path.join(home, '.claude'), { recursive: true });
  fs.writeFileSync(path.join(home, '.claude/settings.json'), '{ this is not valid json');

  const d = runBackupTool(['detect'], { HOME: home });
  assert.strictEqual(d.status, 0, d.stderr);
  assert.match(d.stdout, /settings\.json ship-guard group: UNDETERMINED \(not valid JSON\)/);
  assert.match(d.stdout, /^legacy targets: 0$/m, 'an unparseable file must not be counted as a legacy signal');

  // backup must still fail loudly on the same corrupted file — a silent
  // hasHookGroup:false in the manifest would be a false backup.
  const b = runBackupTool(['backup', '--dest', path.join(home, 'b')], { HOME: home });
  assert.notStrictEqual(b.status, 0);
  assert.match(b.stderr, /not valid JSON/i);
});

test('verify passes on intact backup and fails on tampered manifest', () => {
  const home = mkFakeHome();
  const dest = path.join(home, 'backup');
  assert.strictEqual(runBackupTool(['backup', '--dest', dest], { HOME: home }).status, 0);

  assert.strictEqual(runBackupTool(['verify', '--from', dest], { HOME: home }).status, 0);

  const mp = path.join(dest, 'MANIFEST.json');
  const manifest = JSON.parse(fs.readFileSync(mp, 'utf8'));
  const target = manifest.files.find((f) => f.kind === 'file');
  target.sha256 = 'sha256:' + '0'.repeat(64);
  fs.writeFileSync(mp, JSON.stringify(manifest, null, 2) + '\n');
  const bad = runBackupTool(['verify', '--from', dest], { HOME: home });
  assert.notStrictEqual(bad.status, 0);
  assert.match(bad.stdout + bad.stderr, /mismatch/i);
});

test('restore --dry-run reports actions without writing', () => {
  const home = mkFakeHome();
  const dest = path.join(home, 'backup');
  assert.strictEqual(runBackupTool(['backup', '--dest', dest], { HOME: home }).status, 0);

  // 제거를 흉내: 벤더 디렉터리와 훅 파일 삭제
  fs.rmSync(path.join(home, '.triple-crown'), { recursive: true, force: true });
  fs.rmSync(path.join(home, '.claude/hooks/triple-crown-ship-guard.cjs'), { force: true });
  const claudeMdBefore = fs.readFileSync(path.join(home, 'CLAUDE.md'), 'utf8');

  const r = runBackupTool(['restore', '--from', dest, '--dry-run'], { HOME: home });
  assert.strictEqual(r.status, 0, r.stderr);
  assert.match(r.stdout, /\[dry-run\]/);
  assert.match(r.stdout, /\.triple-crown/);

  assert.strictEqual(fs.existsSync(path.join(home, '.triple-crown')), false, 'dry-run must not write');
  assert.strictEqual(fs.readFileSync(path.join(home, 'CLAUDE.md'), 'utf8'), claudeMdBefore);
});

test('restore refuses a backup taken from a different home', () => {
  const home = mkFakeHome();
  const dest = path.join(home, 'backup');
  assert.strictEqual(runBackupTool(['backup', '--dest', dest], { HOME: home }).status, 0);

  // 다른 계정/머신을 흉내: 자기 레거시 설치가 있는 별개의 홈
  const other = mkFakeHome();
  const otherVersion = fs.readFileSync(path.join(other, '.triple-crown/VERSION'), 'utf8');

  const refused = runBackupTool(['restore', '--from', dest], { HOME: other });
  assert.notStrictEqual(refused.status, 0, 'foreign-home restore must be refused');
  assert.match(refused.stderr, /different home/i);
  assert.strictEqual(fs.readFileSync(path.join(other, '.triple-crown/VERSION'), 'utf8'), otherVersion,
    'refusal must not touch the current home');

  const refusedDry = runBackupTool(['restore', '--from', dest, '--dry-run'], { HOME: other });
  assert.notStrictEqual(refusedDry.status, 0, '--dry-run must not bypass the refusal');

  const allowed = runBackupTool(
    ['restore', '--from', dest, '--dry-run', '--allow-foreign-home'], { HOME: other });
  assert.strictEqual(allowed.status, 0, allowed.stderr);
  assert.match(allowed.stdout + allowed.stderr, /WARNING/);
});

test('mid-restore failure rolls back a newly-created target that already succeeded (exit 2, home unchanged)', () => {
  const home = mkFakeHome();
  const dest = path.join(home, 'backup');
  assert.strictEqual(runBackupTool(['backup', '--dest', dest], { HOME: home }).status, 0);

  const capabilityBefore = fs.readFileSync(
    path.join(home, '.gsd/capabilities/triple-gstack/capability.json'), 'utf8');

  // restoreOrder의 첫 항목(.triple-crown)을 백업 이후 지워서, restore 시점에는 "시작 상태에
  // 없던 새 대상"이 되게 만든다. restoreOrder 순서상 이 항목은 실패 지점보다 먼저 처리되므로,
  // 아무 방해가 없으면 cpSync가 통째로 성공해 home에 새로 생긴다 — moved[]는 기존 대상만
  // 추적하므로, 고치기 전 코드는 이 성공한 새 디렉터리를 롤백 목록에 넣지 못하고 그대로 남긴다.
  // 그것이 지금 고친 결함이다.
  fs.rmSync(path.join(home, '.triple-crown'), { recursive: true, force: true });

  // restoreOrder의 뒤쪽 항목(.claude/hooks/triple-crown-ship-guard.cjs)도 지워서 이 항목 역시
  // "새 대상"으로 만든다 — exists(dst)가 false이므로 renameSync가 아니라 곧장 cpSync 경로를
  // 타게 되고, 그 cpSync를 실제 EACCES로 실패시킨다: 부모 디렉터리를 쓰기 불가로 만들면
  // mkdirSync(recursive)는 이미 존재하는 디렉터리라 성공하지만, 그 안에 새 파일을 만드는
  // cpSync는 진짜 권한 오류로 죽는다 — mock이 아니라 실제 코드 경로(fs.cpSync)가 실제 OS 권한
  // 검사에 걸려 실패하는 것이다. .triple-crown은 restoreOrder에서 이 항목보다 앞서 있으므로,
  // 이 실패가 나는 시점엔 이미 성공적으로 복사되어 있다.
  fs.rmSync(path.join(home, '.claude/hooks/triple-crown-ship-guard.cjs'), { force: true });
  const hooksDir = path.join(home, '.claude/hooks');
  fs.chmodSync(hooksDir, 0o555);
  try {
    const r = runBackupTool(['restore', '--from', dest], { HOME: home });
    assert.strictEqual(r.status, 2, `stdout:\n${r.stdout}\nstderr:\n${r.stderr}`);
    assert.match(r.stderr, /restore failed/i);

    // 실패 지점 자체인 대상은 부분 생성 없이 시작 상태(부재)로 남는다.
    assert.strictEqual(
      fs.existsSync(path.join(home, '.claude/hooks/triple-crown-ship-guard.cjs')), false,
      'the failing target itself must not be left partially copied');

    // 핵심 회귀 검증: 실패 지점보다 먼저 성공적으로 새로 생성된 대상(.triple-crown)도
    // 시작 상태(부재)로 되돌아가야 한다 — "rolled back, home is unchanged" 메시지가 참이 되려면.
    assert.strictEqual(
      fs.existsSync(path.join(home, '.triple-crown')), false,
      'a target that did not exist before restore must not survive a mid-restore rollback');

    // 이미 존재했던 대상(capabilities)은 rename-복원으로 온전히 되돌아온다.
    assert.strictEqual(
      fs.readFileSync(path.join(home, '.gsd/capabilities/triple-gstack/capability.json'), 'utf8'),
      capabilityBefore);

    // 롤백이 끝났으므로 롤백 디렉터리도 남기지 않는다.
    const leftoverRollback = fs.readdirSync(home).filter((e) => e.startsWith('.crew-legacy-rollback-'));
    assert.deepStrictEqual(leftoverRollback, []);
  } finally {
    fs.chmodSync(hooksDir, 0o755);
  }
});

test('restore refuses a manifest with no home field (exit 4), and --allow-foreign-home overrides it', () => {
  const home = mkFakeHome();
  const dest = path.join(home, 'backup');
  assert.strictEqual(runBackupTool(['backup', '--dest', dest], { HOME: home }).status, 0);

  // MANIFEST.json은 서명 없는 평문 JSON이다 — home 필드 한 줄만 지워도 "이 홈이 맞다"는
  // 뜻이 되어선 안 된다. 사람이 손댄(또는 손상된) 매니페스트를 흉내낸다.
  const mp = path.join(dest, 'MANIFEST.json');
  const manifest = JSON.parse(fs.readFileSync(mp, 'utf8'));
  delete manifest.home;
  fs.writeFileSync(mp, JSON.stringify(manifest, null, 2) + '\n');

  const versionBefore = fs.readFileSync(path.join(home, '.triple-crown/VERSION'), 'utf8');

  const refused = runBackupTool(['restore', '--from', dest, '--dry-run'], { HOME: home });
  assert.strictEqual(refused.status, 4, `stdout:\n${refused.stdout}\nstderr:\n${refused.stderr}`);
  assert.match(refused.stderr, /no home field/i);
  assert.strictEqual(fs.readFileSync(path.join(home, '.triple-crown/VERSION'), 'utf8'), versionBefore,
    'a missing home field must be refused even under --dry-run, and must not touch the home');

  const allowed = runBackupTool(
    ['restore', '--from', dest, '--dry-run', '--allow-foreign-home'], { HOME: home });
  assert.strictEqual(allowed.status, 0, allowed.stderr);
  assert.match(allowed.stdout + allowed.stderr, /WARNING/);
});

test('restore refuses a restoreOrder entry that escapes $HOME (exit 2, before any write)', () => {
  const home = mkFakeHome();
  const dest = path.join(home, 'backup');
  assert.strictEqual(runBackupTool(['backup', '--dest', dest], { HOME: home }).status, 0);

  // 손으로 편집한 restoreOrder에 `..` 이스케이프를 심는다 — 도구가 만든 매니페스트는 이런
  // 경로를 절대 만들지 않지만, MANIFEST.json은 그냥 평문 JSON이라 누구나 편집할 수 있다.
  const mp = path.join(dest, 'MANIFEST.json');
  const manifest = JSON.parse(fs.readFileSync(mp, 'utf8'));
  const escapeRel = '../crew-legacy-escape-marker';
  const escapedAbs = path.join(path.dirname(home), 'crew-legacy-escape-marker');
  manifest.restoreOrder.push(escapeRel);
  fs.writeFileSync(mp, JSON.stringify(manifest, null, 2) + '\n');

  const versionBefore = fs.readFileSync(path.join(home, '.triple-crown/VERSION'), 'utf8');

  const r = runBackupTool(['restore', '--from', dest], { HOME: home });
  assert.strictEqual(r.status, 2, `stdout:\n${r.stdout}\nstderr:\n${r.stderr}`);
  assert.match(r.stderr, /escapes \$HOME/i);

  assert.strictEqual(fs.existsSync(escapedAbs), false, 'the escaped target must never be written');
  assert.strictEqual(fs.readFileSync(path.join(home, '.triple-crown/VERSION'), 'utf8'), versionBefore,
    'aborting on an escape must not touch the legitimate home targets either');
});

test('rollback recovers unrelated targets even when one entry is structurally blocked (best-effort undo)', () => {
  const home = mkFakeHome();
  const dest = path.join(home, 'backup');
  assert.strictEqual(runBackupTool(['backup', '--dest', dest], { HOME: home }).status, 0);

  const versionBefore = fs.readFileSync(path.join(home, '.triple-crown/VERSION'), 'utf8');
  const capabilityBefore = fs.readFileSync(
    path.join(home, '.gsd/capabilities/triple-gstack/capability.json'), 'utf8');

  // 손으로 편집한 restoreOrder에 부모 디렉터리(.claude/hooks)를, 이미 있던 자식 항목
  // (.claude/hooks/triple-crown-ship-guard.cjs) 바로 앞에 끼워 넣는다. 도구가 만든
  // 매니페스트는 이런 중첩 쌍을 절대 만들지 않지만, MANIFEST.json은 평문 JSON이라
  // 누구나 편집할 수 있다.
  const mp = path.join(dest, 'MANIFEST.json');
  const manifest = JSON.parse(fs.readFileSync(mp, 'utf8'));
  const hookFileIdx = manifest.restoreOrder.indexOf('.claude/hooks/triple-crown-ship-guard.cjs');
  manifest.restoreOrder.splice(hookFileIdx, 0, '.claude/hooks');
  fs.writeFileSync(mp, JSON.stringify(manifest, null, 2) + '\n');

  // .claude/hooks 전체를 지워서 부모가 "새 대상"(created)이 되게 만든다 — forward pass에서
  // 부모가 통째로 복사되면 그 안의 자식은 이제 "이미 있는" 대상(moved)으로 잡힌다.
  fs.rmSync(path.join(home, '.claude/hooks'), { recursive: true, force: true });

  // restoreOrder의 뒤쪽 항목(.claude/skills/gsd-triple-crown)에서 실제 EACCES로 forward pass를
  // 끊는다 — round-1 테스트와 같은, 부모 디렉터리를 쓰기 불가로 만드는 진짜 권한 오류다.
  fs.rmSync(path.join(home, '.claude/skills/gsd-triple-crown'), { recursive: true, force: true });
  const skillsDir = path.join(home, '.claude/skills');
  fs.chmodSync(skillsDir, 0o555);
  try {
    const r = runBackupTool(['restore', '--from', dest], { HOME: home });
    assert.strictEqual(r.status, 2, `stdout:\n${r.stdout}\nstderr:\n${r.stderr}`);

    // 회복 가능한 대상(중첩과 무관한, 앞서 처리된 moved 항목들)은 실제로 홈에 되돌아와 있다 —
    // 하나가 막혔다고 나머지까지 방치되지 않는다는 게 이번 수정의 핵심이다.
    assert.strictEqual(fs.readFileSync(path.join(home, '.triple-crown/VERSION'), 'utf8'), versionBefore);
    assert.strictEqual(
      fs.readFileSync(path.join(home, '.gsd/capabilities/triple-gstack/capability.json'), 'utf8'),
      capabilityBefore);

    // created로 분류된 실패 유발 대상은 끝까지 존재하지 않는다.
    assert.strictEqual(fs.existsSync(path.join(home, '.claude/skills/gsd-triple-crown')), false);

    // 무언가 온전히 되돌아오지 못했다면(중첩된 .claude/hooks가 그 경우다 — 자식은 복구됐지만
    // 부모 자체는 created 추적에서 "정리됨"으로 보지 않는다), 롤백 디렉터리의 절대 경로가
    // stderr에 남아야 한다 — 사용자가 직접 확인할 곳을 알 수 있게.
    const rollbackDirs = fs.readdirSync(home).filter((e) => e.startsWith('.crew-legacy-rollback-'));
    if (rollbackDirs.length) {
      assert.match(r.stderr, /could not fully complete/i);
      assert.ok(r.stderr.includes(path.join(home, rollbackDirs[0])),
        `rollback directory path must be disclosed in stderr:\n${r.stderr}`);
    } else {
      assert.match(r.stderr, /rolled back, home is unchanged/i);
    }
  } finally {
    fs.chmodSync(skillsDir, 0o755);
  }
});

test('restore puts back removed targets and reinserts CLAUDE.md fragment', () => {
  const home = mkFakeHome();
  const dest = path.join(home, 'backup');
  assert.strictEqual(runBackupTool(['backup', '--dest', dest], { HOME: home }).status, 0);

  // 제거를 흉내: 디렉터리·훅 삭제 + CLAUDE.md에서 마커 블록만 제거
  fs.rmSync(path.join(home, '.triple-crown'), { recursive: true, force: true });
  fs.rmSync(path.join(home, '.gsd/capabilities/triple-gstack'), { recursive: true, force: true });
  fs.rmSync(path.join(home, '.claude/hooks/triple-crown-ship-guard.cjs'), { force: true });
  fs.writeFileSync(path.join(home, 'CLAUDE.md'), '# user content\nuser line kept\nuser added later\n');

  const r = runBackupTool(['restore', '--from', dest], { HOME: home });
  assert.strictEqual(r.status, 0, r.stderr);

  assert.ok(fs.existsSync(path.join(home, '.triple-crown/VERSION')));
  assert.ok(fs.existsSync(path.join(home, '.gsd/capabilities/triple-gstack/capability.json')));
  assert.ok(fs.existsSync(path.join(home, '.claude/hooks/triple-crown-ship-guard.cjs')));

  const md = fs.readFileSync(path.join(home, 'CLAUDE.md'), 'utf8');
  assert.match(md, /triple-crown:managed-routing:start/);
  assert.match(md, /user added later/, 'user content must survive');
  assert.ok(md.indexOf('managed-routing:start') < md.indexOf('# user content'),
    'fragment restored at original position (line 1 -> prepend)');
});

test('restore is idempotent for CLAUDE.md when markers already present', () => {
  const home = mkFakeHome();
  const dest = path.join(home, 'backup');
  assert.strictEqual(runBackupTool(['backup', '--dest', dest], { HOME: home }).status, 0);
  const before = fs.readFileSync(path.join(home, 'CLAUDE.md'), 'utf8');
  const r = runBackupTool(['restore', '--from', dest], { HOME: home });
  assert.strictEqual(r.status, 0, r.stderr);
  assert.strictEqual(fs.readFileSync(path.join(home, 'CLAUDE.md'), 'utf8'), before);
});

test('restore rolls back and leaves home unchanged when a copy fails midway', () => {
  const home = mkFakeHome();
  const dest = path.join(home, 'backup');
  assert.strictEqual(runBackupTool(['backup', '--dest', dest], { HOME: home }).status, 0);

  // 백업 이후 현재 홈을 아카이브와 다르게 만든다 — 롤백이 '아카이브 내용'이 아니라
  // '복구 직전 상태'를 되돌리는지 구분하기 위해.
  const versionBefore = '9.9.9-local\n';
  fs.writeFileSync(path.join(home, '.triple-crown/VERSION'), versionBefore);

  // restoreOrder 중간 항목(.claude/hooks/... )에서 mkdir이 실패하도록 디렉터리 자리에 파일을 둔다.
  fs.rmSync(path.join(home, '.claude/hooks'), { recursive: true, force: true });
  fs.writeFileSync(path.join(home, '.claude/hooks'), 'not a directory\n');

  const r = runBackupTool(['restore', '--from', dest], { HOME: home });
  assert.notStrictEqual(r.status, 0, 'mid-copy failure must abort');
  assert.match(r.stderr, /rolled back/i);
  assert.strictEqual(fs.readFileSync(path.join(home, '.triple-crown/VERSION'), 'utf8'), versionBefore,
    'targets replaced before the failure must be back at their pre-restore state');
  assert.deepStrictEqual(
    fs.readdirSync(home).filter((e) => e.startsWith('.crew-legacy-rollback-')), [],
    'failed restore must not leave a rollback directory behind');
});

test('restore appends CLAUDE.md fragment when the original marker was not at file start', () => {
  const home = mkFakeHome();
  const dest = path.join(home, 'backup');
  assert.strictEqual(runBackupTool(['backup', '--dest', dest], { HOME: home }).status, 0);

  // 매니페스트를 손질해 원래 마커가 1행이 아니었던 것처럼 만든다 — restoreClaudeMd가
  // prepend가 아니라 append 분기를 타게 하기 위해서다 (fake home의 마커는 항상 1행이므로).
  const mp = path.join(dest, 'MANIFEST.json');
  const manifest = JSON.parse(fs.readFileSync(mp, 'utf8'));
  manifest.claudeMd.startLine = 5;
  fs.writeFileSync(mp, JSON.stringify(manifest, null, 2) + '\n');

  // 마커 없는, 끝에 개행이 없는 사용자 파일 — append가 사용자 바이트를 그대로 보존하고
  // 구분용 개행 하나만 정규화해 붙이는지 확인한다.
  const userContent = '# user content\nuser line kept, no trailing newline';
  fs.writeFileSync(path.join(home, 'CLAUDE.md'), userContent);

  const r = runBackupTool(['restore', '--from', dest], { HOME: home });
  assert.strictEqual(r.status, 0, r.stderr);

  const md = fs.readFileSync(path.join(home, 'CLAUDE.md'), 'utf8');
  const frag = fs.readFileSync(path.join(dest, 'CLAUDE.md.fragment'), 'utf8');
  assert.strictEqual(md, userContent + '\n' + frag,
    'user bytes preserved verbatim, single newline normalized, fragment appended at the end');
});

test('restore --dry-run does not write CLAUDE.md when appending (startLine !== 1)', () => {
  const home = mkFakeHome();
  const dest = path.join(home, 'backup');
  assert.strictEqual(runBackupTool(['backup', '--dest', dest], { HOME: home }).status, 0);

  const mp = path.join(dest, 'MANIFEST.json');
  const manifest = JSON.parse(fs.readFileSync(mp, 'utf8'));
  manifest.claudeMd.startLine = 5;
  fs.writeFileSync(mp, JSON.stringify(manifest, null, 2) + '\n');

  const userContent = '# user content\nuser line kept\n';
  fs.writeFileSync(path.join(home, 'CLAUDE.md'), userContent);

  const r = runBackupTool(['restore', '--from', dest, '--dry-run'], { HOME: home });
  assert.strictEqual(r.status, 0, r.stderr);
  assert.match(r.stdout, /\[dry-run\] CLAUDE\.md: append fragment/);
  assert.strictEqual(fs.readFileSync(path.join(home, 'CLAUDE.md'), 'utf8'), userContent,
    'dry-run must not write CLAUDE.md (append branch)');
});

test('restore --dry-run does not create CLAUDE.md when it is absent', () => {
  const home = mkFakeHome();
  const dest = path.join(home, 'backup');
  assert.strictEqual(runBackupTool(['backup', '--dest', dest], { HOME: home }).status, 0);
  fs.rmSync(path.join(home, 'CLAUDE.md'));

  const r = runBackupTool(['restore', '--from', dest, '--dry-run'], { HOME: home });
  assert.strictEqual(r.status, 0, r.stderr);
  assert.match(r.stdout, /\[dry-run\] CLAUDE\.md: missing — create with fragment/);
  assert.strictEqual(fs.existsSync(path.join(home, 'CLAUDE.md')), false,
    'dry-run must not create CLAUDE.md');
});

test('restore --dry-run does not write CLAUDE.md when prepending (startLine === 1)', () => {
  const home = mkFakeHome();
  const dest = path.join(home, 'backup');
  assert.strictEqual(runBackupTool(['backup', '--dest', dest], { HOME: home }).status, 0);

  const userContent = '# user content\nuser line kept\nuser added later\n';
  fs.writeFileSync(path.join(home, 'CLAUDE.md'), userContent);

  const r = runBackupTool(['restore', '--from', dest, '--dry-run'], { HOME: home });
  assert.strictEqual(r.status, 0, r.stderr);
  assert.match(r.stdout, /\[dry-run\] CLAUDE\.md: prepend fragment/);
  assert.strictEqual(fs.readFileSync(path.join(home, 'CLAUDE.md'), 'utf8'), userContent,
    'dry-run must not write CLAUDE.md (prepend branch)');
});

test('restore refuses a malformed CLAUDE.md marker state (exit 2, no write, restoreOrder still applied)', () => {
  const home = mkFakeHome();
  const dest = path.join(home, 'backup');
  assert.strictEqual(runBackupTool(['backup', '--dest', dest], { HOME: home }).status, 0);

  // restoreOrder가 CLAUDE.md 실패와 무관하게 정상 적용됐는지 보려고 미리 지운다.
  fs.rmSync(path.join(home, '.triple-crown'), { recursive: true, force: true });

  // 마커가 반쯤만 남은 상태를 흉내: 시작 마커만 있고 끝 마커가 없다.
  const malformed = '<!-- triple-crown:managed-routing:start -->\n# user notes\nkept as-is\n';
  fs.writeFileSync(path.join(home, 'CLAUDE.md'), malformed);

  const r = runBackupTool(['restore', '--from', dest], { HOME: home });
  assert.strictEqual(r.status, 2, `stdout:\n${r.stdout}\nstderr:\n${r.stderr}`);
  assert.match(r.stderr, /malformed/i);
  assert.strictEqual(fs.readFileSync(path.join(home, 'CLAUDE.md'), 'utf8'), malformed,
    'a malformed marker state must not be written to');
  assert.ok(fs.existsSync(path.join(home, '.triple-crown/VERSION')),
    'restoreOrder targets must still be restored even though CLAUDE.md was refused');
});
