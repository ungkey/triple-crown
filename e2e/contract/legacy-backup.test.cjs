'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const { mkFakeHome, runBackupTool, CAPABILITIES } = require('./helpers/fake-home.cjs');
const { tempDir } = require('./helpers/repo.cjs');

// chmod 555는 root에서 무효다 — root로 도는 CI 컨테이너에서 아래 두 파괴-경로 테스트는
// 조용한 vacuous pass가 아니라 실제 실패로 게이트를 막는다. 권한 거부를 실제로 일으킬 수
// 없는 환경에서는 건너뛴다(거짓 green이 아니라 명시적 skip).
const IS_ROOT = typeof process.getuid === 'function' && process.getuid() === 0;
const ROOT_SKIP = 'chmod 555 does not deny root — this test needs a non-root uid';

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
  assert.strictEqual(r.status, 2, r.stderr);

  const emptyHome = tempDir('crew-empty-');
  const r2 = runBackupTool(['backup', '--dest', path.join(emptyHome, 'b')], { HOME: emptyHome });
  assert.strictEqual(r2.status, 2, r2.stderr);
  assert.match(r2.stderr, /nothing to back up/i);
});

test('detect reports the inventory of any home and never fails on an absent install', () => {
  // 레거시가 설치된 적 없는 PC — Task 9가 여기서 막히면 안 된다.
  const emptyHome = tempDir('crew-empty-');
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
  assert.strictEqual(b.status, 2, b.stderr);
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
  const home = tempDir('crew-corrupt-');
  fs.mkdirSync(path.join(home, '.claude'), { recursive: true });
  fs.writeFileSync(path.join(home, '.claude/settings.json'), '{ this is not valid json');

  const d = runBackupTool(['detect'], { HOME: home });
  assert.strictEqual(d.status, 0, d.stderr);
  assert.match(d.stdout, /settings\.json ship-guard group: UNDETERMINED \(not valid JSON\)/);
  assert.match(d.stdout, /^legacy targets: 0$/m, 'an unparseable file must not be counted as a legacy signal');

  // backup must still fail loudly on the same corrupted file — a silent
  // hasHookGroup:false in the manifest would be a false backup.
  const b = runBackupTool(['backup', '--dest', path.join(home, 'b')], { HOME: home });
  assert.strictEqual(b.status, 2, b.stderr);
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
  assert.strictEqual(bad.status, 2, bad.stderr);
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
  assert.strictEqual(refused.status, 4,
    `foreign-home restore must be refused with the documented code 4:\n${refused.stderr}`);
  assert.match(refused.stderr, /different home/i);
  assert.strictEqual(fs.readFileSync(path.join(other, '.triple-crown/VERSION'), 'utf8'), otherVersion,
    'refusal must not touch the current home');

  const refusedDry = runBackupTool(['restore', '--from', dest, '--dry-run'], { HOME: other });
  assert.strictEqual(refusedDry.status, 4, '--dry-run must not bypass the refusal');

  const allowed = runBackupTool(
    ['restore', '--from', dest, '--dry-run', '--allow-foreign-home'], { HOME: other });
  assert.strictEqual(allowed.status, 0, allowed.stderr);
  assert.match(allowed.stdout + allowed.stderr, /WARNING/);
});

test('mid-restore failure rolls back a newly-created target that already succeeded (exit 2, home unchanged)', (t) => {
  if (IS_ROOT) { t.skip(ROOT_SKIP); return; }
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

    // 회귀 검증(리뷰 라운드 1): stdout이 위에서 부재를 증명한 경로들에 대해 "썼다"고 주장하면
    // 안 된다 — applyRestore()가 각 대상을 실제로 복사한 직후에만 overwrite:/create: 줄을
    // 찍고, 그 대상이 자신의 롤백으로 되돌려지면 그 줄을 다시 지운다(actionIndexByDst). 이
    // 시나리오는 처리된 네 항목(.triple-crown, capabilities 셋) 전부가 실패 지점 전에 성공했다가
    // 전량 롤백됐으므로, stdout에는 어떤 overwrite:/create: 줄도 남아 있으면 안 된다.
    assert.doesNotMatch(r.stdout, /create: ~\/\.triple-crown/,
      `a rolled-back target must not be claimed as written in stdout:\n${r.stdout}`);
    assert.doesNotMatch(r.stdout, /create: ~\/\.claude\/hooks\/triple-crown-ship-guard\.cjs/,
      `the failing target itself must not be claimed as written in stdout:\n${r.stdout}`);
    assert.doesNotMatch(r.stdout, /(overwrite|create): ~\//,
      `a fully rolled-back restore must not claim any write in stdout, got:\n${r.stdout}`);

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

test('rollback recovers unrelated targets even when one entry is structurally blocked (best-effort undo)', (t) => {
  if (IS_ROOT) { t.skip(ROOT_SKIP); return; }
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
  assert.strictEqual(r.status, 2, `mid-copy failure must abort with code 2:\n${r.stderr}`);
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

test('settings restore: predicate-based reinsert preserves user hooks', () => {
  const home = mkFakeHome();
  const dest = path.join(home, 'backup');
  assert.strictEqual(runBackupTool(['backup', '--dest', dest], { HOME: home }).status, 0);

  // 제거 흉내(그룹 삭제) + 사용자가 자기 훅 추가
  const sp = path.join(home, '.claude/settings.json');
  const settings = JSON.parse(fs.readFileSync(sp, 'utf8'));
  settings.hooks.PreToolUse = [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'my-user-hook.sh' }] }];
  fs.writeFileSync(sp, JSON.stringify(settings, null, 2) + '\n');

  const r = runBackupTool(['restore', '--from', dest], { HOME: home });
  assert.strictEqual(r.status, 0, r.stderr);

  const after = JSON.parse(fs.readFileSync(sp, 'utf8'));
  assert.strictEqual(after.userSetting, true, 'unrelated keys preserved');
  assert.strictEqual(after.hooks.PreToolUse.length, 2);
  assert.strictEqual(after.hooks.PreToolUse[0].hooks[0].command, 'my-user-hook.sh',
    'user hook untouched, index not referenced');
  assert.match(after.hooks.PreToolUse[1].hooks[0].command, /triple-crown-ship-guard\.cjs/);
});

test('settings restore: no duplicate when group already present', () => {
  const home = mkFakeHome();
  const dest = path.join(home, 'backup');
  assert.strictEqual(runBackupTool(['backup', '--dest', dest], { HOME: home }).status, 0);

  // sha를 어긋나게 하되 그룹은 그대로 둠
  const sp = path.join(home, '.claude/settings.json');
  const settings = JSON.parse(fs.readFileSync(sp, 'utf8'));
  settings.newUserKey = 1;
  fs.writeFileSync(sp, JSON.stringify(settings, null, 2) + '\n');

  const r = runBackupTool(['restore', '--from', dest], { HOME: home });
  assert.strictEqual(r.status, 0, r.stderr);
  const after = JSON.parse(fs.readFileSync(sp, 'utf8'));
  const guardGroups = after.hooks.PreToolUse.filter((g) =>
    g.hooks.some((h) => String(h.command || '').includes('triple-crown-ship-guard.cjs')));
  assert.strictEqual(guardGroups.length, 1, 'idempotent — no duplicate');
  assert.strictEqual(after.newUserKey, 1);
});

test('settings restore: aborts without writing when current file is invalid JSON', () => {
  const home = mkFakeHome();
  const dest = path.join(home, 'backup');
  assert.strictEqual(runBackupTool(['backup', '--dest', dest], { HOME: home }).status, 0);

  const sp = path.join(home, '.claude/settings.json');
  fs.writeFileSync(sp, '{ broken json\n');

  const r = runBackupTool(['restore', '--from', dest], { HOME: home });
  // 3은 이 브랜치의 유일한 "정의된 상태" 코드다 — 2(복구 중단·롤백 완료)로 퇴화하면 런북이
  // "수동 병합 대기"와 "중단됨"을 구분할 수 없게 된다. 정확히 고정한다.
  assert.strictEqual(r.status, 3,
    `settings conflict is a defined state, not an abort:\nstdout:\n${r.stdout}\nstderr:\n${r.stderr}`);
  assert.match(r.stderr, /manual/i);
  assert.strictEqual(fs.readFileSync(sp, 'utf8'), '{ broken json\n', 'no automatic write on conflict');

  // trackActions/flushPendingActions의 존재 이유 그 자체: exit 3에서도 "원본은 여기 있다"는
  // 안내가 살아남아야 한다. applyRestore가 이미 6개 대상을 교체한 뒤의 종료이기 때문이다.
  const rollbackDirs = fs.readdirSync(home).filter((e) => e.startsWith('.crew-legacy-rollback-'));
  assert.strictEqual(rollbackDirs.length, 1,
    `replaced originals must be kept for rollback, got: ${JSON.stringify(rollbackDirs)}`);
  assert.ok(r.stdout.includes(rollbackDirs[0]),
    `the rollback directory must be disclosed on an exit-3 stop:\nstdout:\n${r.stdout}`);
});

// --- C1: 백업의 side file 2종(CLAUDE.md.fragment / settings.json.hookgroup)은 archive.tar.gz
// **밖**에 있고, verifyArchive는 manifest.files(=tar 내용)만 순회한다. 그래서 둘 중 하나가
// 없거나 손상돼도 verify가 "verify OK"를 찍었고, 그 직후 restore가 홈의 restoreOrder 대상을
// 전부 교체한 다음 네이티브 예외로 죽었다 — exit 1(계약은 2), stdout 비어 있음, 원본을 옮겨둔
// ~/.crew-legacy-rollback-XXXXXX 위치는 어디에도 안 나옴. 적대자 없이 rsync 부분 복사·정리
// 스크립트·동기화 경합만으로 도달한다.

test('restore refuses a backup whose CLAUDE.md.fragment is missing (exit 2, nothing replaced)', () => {
  const home = mkFakeHome();
  const dest = path.join(home, 'backup');
  assert.strictEqual(runBackupTool(['backup', '--dest', dest], { HOME: home }).status, 0);

  // 홈을 아카이브와 다르게 만들어 둔다 — 교체가 실제로 일어났는지 바이트로 구분하기 위해.
  const sentinel = '9.9.9-local\n';
  fs.writeFileSync(path.join(home, '.triple-crown/VERSION'), sentinel);

  fs.rmSync(path.join(dest, 'CLAUDE.md.fragment'));

  const r = runBackupTool(['restore', '--from', dest], { HOME: home });
  assert.strictEqual(r.status, 2,
    `a backup missing a side file must abort with 2, not die with 1:\nstdout:\n${r.stdout}\nstderr:\n${r.stderr}`);
  assert.match(r.stdout + r.stderr, /CLAUDE\.md\.fragment/,
    'the failure must name the side file the backup is missing');
  assert.strictEqual(fs.readFileSync(path.join(home, '.triple-crown/VERSION'), 'utf8'), sentinel,
    'the check must run before any target is replaced — nothing was changed');
  assert.deepStrictEqual(fs.readdirSync(home).filter((e) => e.startsWith('.crew-legacy-rollback-')), [],
    'nothing was replaced, so no rollback directory may be left behind');
});

test('restore refuses a backup whose settings.json.hookgroup is missing or corrupt (exit 2, nothing replaced)', () => {
  const home = mkFakeHome();
  const dest = path.join(home, 'backup');
  assert.strictEqual(runBackupTool(['backup', '--dest', dest], { HOME: home }).status, 0);

  // hookgroup 파일은 sha가 어긋나고 그룹이 사라진 conflict 경로에서만 읽힌다 — 그 상태를 만든다.
  const sp = path.join(home, '.claude/settings.json');
  const settings = JSON.parse(fs.readFileSync(sp, 'utf8'));
  settings.hooks.PreToolUse = [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'my-user-hook.sh' }] }];
  fs.writeFileSync(sp, JSON.stringify(settings, null, 2) + '\n');

  const sentinel = '9.9.9-local\n';
  fs.writeFileSync(path.join(home, '.triple-crown/VERSION'), sentinel);

  const hg = path.join(dest, 'settings.json.hookgroup');
  fs.rmSync(hg);
  const missing = runBackupTool(['restore', '--from', dest], { HOME: home });
  assert.strictEqual(missing.status, 2,
    `missing hookgroup must abort with 2:\nstdout:\n${missing.stdout}\nstderr:\n${missing.stderr}`);
  assert.match(missing.stdout + missing.stderr, /settings\.json\.hookgroup/);
  assert.strictEqual(fs.readFileSync(path.join(home, '.triple-crown/VERSION'), 'utf8'), sentinel,
    'nothing may be replaced before the side file is known to be usable');
  assert.deepStrictEqual(fs.readdirSync(home).filter((e) => e.startsWith('.crew-legacy-rollback-')), []);

  // 존재하지만 파싱이 안 되는 경우도 같은 계약이다 — 부분 복사로 흔한 상태다.
  fs.writeFileSync(hg, '{ "matcher": "Bash", truncated\n');
  const corrupt = runBackupTool(['restore', '--from', dest], { HOME: home });
  assert.strictEqual(corrupt.status, 2,
    `corrupt hookgroup must abort with 2:\nstdout:\n${corrupt.stdout}\nstderr:\n${corrupt.stderr}`);
  assert.match(corrupt.stdout + corrupt.stderr, /settings\.json\.hookgroup/);
  assert.strictEqual(fs.readFileSync(path.join(home, '.triple-crown/VERSION'), 'utf8'), sentinel);
  assert.deepStrictEqual(fs.readdirSync(home).filter((e) => e.startsWith('.crew-legacy-rollback-')), []);
});

test('restore that dies after replacing targets exits 2 and discloses the rollback directory', () => {
  const home = mkFakeHome();
  const dest = path.join(home, 'backup');
  assert.strictEqual(runBackupTool(['backup', '--dest', dest], { HOME: home }).status, 0);

  // 백업 이후 ~/CLAUDE.md가 디렉터리가 된 홈. 선검증으로는 못 막는다(백업 쪽은 멀쩡하다) —
  // restoreClaudeMd의 readFileSync가 EISDIR로 네이티브 예외를 던지는데, 그 시점엔
  // restoreOrder 대상 6개가 이미 교체된 뒤다. 여기서 flush를 건너뛰면 사용자는 절반 복구된
  // 홈만 남고 원본이 어디로 갔는지 알 길이 없다.
  fs.rmSync(path.join(home, 'CLAUDE.md'));
  fs.mkdirSync(path.join(home, 'CLAUDE.md'));

  const r = runBackupTool(['restore', '--from', dest], { HOME: home });
  assert.strictEqual(r.status, 2,
    `an unexpected throw must land on the documented code 2, not a raw exit 1:\nstdout:\n${r.stdout}\nstderr:\n${r.stderr}`);

  const rollbackDirs = fs.readdirSync(home).filter((e) => e.startsWith('.crew-legacy-rollback-'));
  assert.strictEqual(rollbackDirs.length, 1,
    `the replaced originals must still be on disk, got: ${JSON.stringify(rollbackDirs)}`);
  assert.ok(r.stdout.includes(rollbackDirs[0]),
    `the rollback directory holding the originals must be disclosed:\nstdout:\n${r.stdout}\nstderr:\n${r.stderr}`);
});

test('verify fails on a backup with a missing, tampered, or corrupt side file (exit 2)', () => {
  const home = mkFakeHome();
  const dest = path.join(home, 'backup');
  assert.strictEqual(runBackupTool(['backup', '--dest', dest], { HOME: home }).status, 0);
  assert.strictEqual(runBackupTool(['verify', '--from', dest], { HOME: home }).status, 0, 'control: intact backup verifies');

  const fragPath = path.join(dest, 'CLAUDE.md.fragment');
  const fragBytes = fs.readFileSync(fragPath);

  fs.rmSync(fragPath);
  const gone = runBackupTool(['verify', '--from', dest], { HOME: home });
  assert.strictEqual(gone.status, 2,
    `verify must not certify a backup restore cannot use:\nstdout:\n${gone.stdout}\nstderr:\n${gone.stderr}`);
  assert.match(gone.stdout + gone.stderr, /CLAUDE\.md\.fragment/);

  // 존재하지만 내용이 바뀐 경우 — manifest.claudeMd.fragmentSha256이 실제로 대조되는지.
  fs.writeFileSync(fragPath, '<!-- tampered, not the recorded fragment -->\n');
  const tampered = runBackupTool(['verify', '--from', dest], { HOME: home });
  assert.strictEqual(tampered.status, 2,
    `fragmentSha256 must actually be checked:\nstdout:\n${tampered.stdout}\nstderr:\n${tampered.stderr}`);
  assert.match(tampered.stdout + tampered.stderr, /CLAUDE\.md\.fragment/);

  fs.writeFileSync(fragPath, fragBytes);
  fs.writeFileSync(path.join(dest, 'settings.json.hookgroup'), '{ "matcher": "Bash", truncated\n');
  const badGroup = runBackupTool(['verify', '--from', dest], { HOME: home });
  assert.strictEqual(badGroup.status, 2,
    `an unparseable hook group must not verify:\nstdout:\n${badGroup.stdout}\nstderr:\n${badGroup.stderr}`);
  assert.match(badGroup.stdout + badGroup.stderr, /settings\.json\.hookgroup/);
});

// --- I1: detect는 "항상 exit 0"이 계약이다 (Task 9 Step 1이 이 코드로 파괴 단계 진입을 정한다).
// 손상된 settings.json은 이미 막혀 있었지만, 평범한 홈 상태 두 가지가 아직 raw 스택으로 죽였다.

test('detect tolerates a dangling symlink in ~/.claude/skills (exit 0, UNDETERMINED)', () => {
  // 사용자가 나중에 옮겨버린 저장소를 가리키는 스킬 심볼릭 링크 — 완전히 평범한 상태다.
  // statSync는 링크를 따라가므로 ENOENT로 던졌다.
  const home = mkFakeHome();
  fs.symlinkSync(path.join(home, 'moved-away-repo', 'skill'), path.join(home, '.claude/skills/ghost'));

  const d = runBackupTool(['detect'], { HOME: home });
  assert.strictEqual(d.status, 0,
    `detect must never fail on an ordinary home:\nstdout:\n${d.stdout}\nstderr:\n${d.stderr}`);
  assert.match(d.stdout, /UNDETERMINED/, 'the unresolvable entry must be surfaced, not silently dropped');
  assert.match(d.stdout, /ghost/, 'the report must name the affected item');
  // 판정 자체는 계속 동작한다 — 나머지 인벤토리를 정상적으로 센다.
  const n = Number(d.stdout.match(/^legacy targets: (\d+)$/m)[1]);
  assert.ok(n > 0, `the rest of the inventory must still be counted, got ${n}`);
});

test('detect tolerates ~/CLAUDE.md being a directory (exit 0, UNDETERMINED) while backup refuses it', () => {
  const home = mkFakeHome();
  fs.rmSync(path.join(home, 'CLAUDE.md'));
  fs.mkdirSync(path.join(home, 'CLAUDE.md'));

  const d = runBackupTool(['detect'], { HOME: home });
  assert.strictEqual(d.status, 0,
    `detect must never fail on an unreadable ~/CLAUDE.md:\nstdout:\n${d.stdout}\nstderr:\n${d.stderr}`);
  assert.match(d.stdout, /CLAUDE\.md routing marker: UNDETERMINED/);

  // backup은 같은 홈에서 조용히 claudeMd.present:false를 기록하면 안 된다 — 손상된
  // settings.json과 같은 규약으로 시끄럽게 거부한다(거짓 백업 금지).
  const b = runBackupTool(['backup', '--dest', path.join(home, 'b')], { HOME: home });
  assert.strictEqual(b.status, 2, `backup must refuse loudly:\nstderr:\n${b.stderr}`);
  assert.match(b.stderr, /CLAUDE\.md/);
});

test('a restore that replaces nothing leaves no rollback directory and claims none', () => {
  const home = mkFakeHome();
  const dest = path.join(home, 'backup');
  assert.strictEqual(runBackupTool(['backup', '--dest', dest], { HOME: home }).status, 0);

  // restoreOrder 대상을 전부 지우면 교체할 것이 하나도 없는 restore가 된다 — 그런데도
  // 롤백 디렉터리를 미리 만들어 두면 실제 $HOME에 빈 ~/.crew-legacy-rollback-XXXXXX가
  // 매 실행마다 쌓이고, "replaced targets kept..."라는 거짓 안내까지 찍혔다.
  const manifest = JSON.parse(fs.readFileSync(path.join(dest, 'MANIFEST.json'), 'utf8'));
  for (const rel of manifest.restoreOrder) fs.rmSync(path.join(home, rel), { recursive: true, force: true });

  const r = runBackupTool(['restore', '--from', dest], { HOME: home });
  assert.strictEqual(r.status, 0, r.stderr);
  assert.deepStrictEqual(fs.readdirSync(home).filter((e) => e.startsWith('.crew-legacy-rollback-')), [],
    'a restore that replaced nothing must not leave an empty rollback directory in $HOME');
  assert.doesNotMatch(r.stdout, /replaced targets kept/,
    `nothing was replaced — the rollback notice must not be printed:\n${r.stdout}`);
});

test('detect tolerates an unreadable ~/.claude/settings.json (exit 0, UNDETERMINED) while backup refuses it', () => {
  // extractFragment 는 readFileSync 를 tolerant 로 감쌌지만 extractHookGroup 은 JSON.parse 만
  // 감싸고 읽기는 노출돼 있었다. settings.json 이 디렉터리이거나 권한이 없으면 detect 가
  // EISDIR/EACCES 로 exit 2 하고 `legacy targets:` 줄 자체가 안 나온다 — Task 9 런북은
  // `set -euo pipefail` 이라 첫 명령에서 멈춘다. 판정 도구는 절대 죽으면 안 된다.
  const home = mkFakeHome();
  fs.rmSync(path.join(home, '.claude/settings.json'));
  fs.mkdirSync(path.join(home, '.claude/settings.json'));

  const d = runBackupTool(['detect'], { HOME: home });
  assert.strictEqual(d.status, 0,
    `detect must never fail on an unreadable settings.json:\nstdout:\n${d.stdout}\nstderr:\n${d.stderr}`);
  assert.match(d.stdout, /settings\.json ship-guard group: UNDETERMINED/);
  assert.match(d.stdout, /^legacy targets: \d+$/m, 'the verdict line must still be printed');

  // backup 은 같은 규약으로 시끄럽게 거부한다 — 읽지 못한 파일을 hasHookGroup:false 로
  // 기록하면 restore 가 훅 그룹을 되살리지 않는 거짓 백업이 된다.
  const b = runBackupTool(['backup', '--dest', path.join(home, 'b')], { HOME: home });
  assert.strictEqual(b.status, 2, `backup must refuse loudly:\nstderr:\n${b.stderr}`);
  assert.match(b.stderr, /settings\.json/);
});

test('detect tolerates a permission-denied ~/.claude/settings.json (exit 0, UNDETERMINED)', (t) => {
  if (IS_ROOT) return t.skip(ROOT_SKIP);
  const home = mkFakeHome();
  const p = path.join(home, '.claude/settings.json');
  fs.chmodSync(p, 0o000);
  t.after(() => { try { fs.chmodSync(p, 0o644); } catch { /* best effort */ } });

  const d = runBackupTool(['detect'], { HOME: home });
  assert.strictEqual(d.status, 0,
    `detect must never fail on a permission-denied settings.json:\nstdout:\n${d.stdout}\nstderr:\n${d.stderr}`);
  assert.match(d.stdout, /settings\.json ship-guard group: UNDETERMINED/);
});

test('detect reports an undetermined count that Task 9 can branch on', () => {
  // `legacy targets: 0` 하나만 보고 "제거할 것 없음"으로 판정하면, 판정 불가 항목만 있는
  // 홈에서 그 분기가 조용히 통과한다. UNDETERMINED 는 "없다"가 아니라 "모른다"이므로
  // 런북이 기계적으로 구분할 수 있어야 한다. 단어를 grep 하는 것으로는 부족하다 —
  // 경로 이름에 UNDETERMINED 가 들어 있으면 거짓 양성이 난다.
  const clean = mkFakeHome();
  const ok = runBackupTool(['detect'], { HOME: clean });
  assert.strictEqual(ok.status, 0, ok.stderr);
  assert.match(ok.stdout, /^undetermined: 0$/m, `a fully-inspectable home must report 0:\n${ok.stdout}`);

  const murky = mkFakeHome();
  fs.rmSync(path.join(murky, 'CLAUDE.md'));
  fs.mkdirSync(path.join(murky, 'CLAUDE.md'));
  fs.symlinkSync(path.join(murky, 'gone', 'skill'), path.join(murky, '.claude/skills/ghost'));
  const d = runBackupTool(['detect'], { HOME: murky });
  assert.strictEqual(d.status, 0, d.stderr);
  const n = Number(d.stdout.match(/^undetermined: (\d+)$/m)[1]);
  assert.strictEqual(n, 2, `both the dangling skill and the unreadable CLAUDE.md must be counted:\n${d.stdout}`);
});

test('restore preserves a relative symlink instead of rewriting it to the extraction path', () => {
  // fs.cpSync 의 verbatimSymlinks 기본값은 false — 상대 링크를 **원본 기준 절대경로**로
  // 다시 쓴다. 복원 원본은 restore 가 finally 에서 지우는 임시 추출 디렉터리이므로,
  // 복원된 링크는 곧바로 없는 경로를 가리킨다. backup 쪽(walkFiles)은 심볼릭 링크를
  // kind:'symlink' + 링크 대상 해시로 충실히 기록하고 verify 도 통과하므로, 손상은
  // "verify OK" 뒤에 조용히 일어난다.
  const home = mkFakeHome();
  const linkRel = '.triple-crown/link-to-version';
  fs.symlinkSync('VERSION', path.join(home, linkRel));

  const dest = path.join(home, 'backup');
  assert.strictEqual(runBackupTool(['backup', '--dest', dest], { HOME: home }).status, 0);
  assert.strictEqual(runBackupTool(['verify', '--from', dest], { HOME: home }).status, 0);

  fs.rmSync(path.join(home, '.triple-crown'), { recursive: true, force: true });
  const r = runBackupTool(['restore', '--from', dest], { HOME: home });
  assert.strictEqual(r.status, 0, r.stderr);

  const restored = path.join(home, linkRel);
  assert.strictEqual(fs.readlinkSync(restored), 'VERSION',
    'a relative symlink must come back relative — an absolute rewrite points into the deleted temp dir');
  assert.strictEqual(fs.readFileSync(restored, 'utf8'), '0.6.3\n',
    'the restored link must resolve to the restored target');
});

// --- 최종 전체 리뷰 수정 ------------------------------------------------------

// C1: 프로젝트 백업의 자급식 복구 스크립트가 자기 루트를 몰랐다. --root 없는 restore 는
// os.homedir() 를 대상으로 삼으므로, 이 스크립트만으로는 복구가 아예 되지 않았고(다른 홈이라
// exit 4), 그 거부가 권하는 --allow-foreign-home 을 따르면 프로젝트의 설치본이 $HOME 에
// 쏟아졌다 — 설계 §2.1 의 "백업만으로 복구 가능" 불변식이 정확히 여기서 깨졌다.
test('a project backup ships a restore.sh that restores that project, not $HOME', (t) => {
  const proj = mkFakeHome();
  const home = tempDir('crew-otherhome-');           // 레거시가 없는 별개의 홈
  const dest = path.join(tempDir('crew-projbackup-'), 'out');
  const b = runBackupTool(['backup', '--root', proj, '--dest', dest], { HOME: home });
  assert.strictEqual(b.status, 0, b.stderr);

  const sh = fs.readFileSync(path.join(dest, 'restore.sh'), 'utf8');
  assert.ok(sh.includes(`--root '${proj}'`), `restore.sh must pin its own root:\n${sh}`);

  if (process.platform === 'win32') { t.skip('restore.sh needs bash'); return; }
  fs.rmSync(path.join(proj, '.triple-crown'), { recursive: true, force: true });
  const r = cp.spawnSync('bash', [path.join(dest, 'restore.sh')],
    { encoding: 'utf8', timeout: 60000, env: { ...process.env, HOME: home, USERPROFILE: home } });
  assert.strictEqual(r.status, 0, `stdout:\n${r.stdout}\nstderr:\n${r.stderr}`);
  assert.ok(fs.existsSync(path.join(proj, '.triple-crown/VERSION')),
    'the backup alone must put the project back');
  assert.strictEqual(fs.existsSync(path.join(home, '.triple-crown')), false,
    "a project's pre-rename installation must never land in a home directory");
});

// C1: 같은 결함의 다른 표면 — 홈에서 project 백업을 restore 하면 거부는 맞지만, 그 거부가
// 권하는 플래그가 틀렸다. --allow-foreign-home 을 따르면 D13(프로젝트가 글로벌로 붕괴)이
// 그대로 재현된다. 정답은 --root 다. manifest.scope 의 유일한 소비처이기도 하다.
test('a project-scope backup refused in a home names --root, not --allow-foreign-home', () => {
  const proj = mkFakeHome();
  const home = tempDir('crew-otherhome-');
  const dest = path.join(tempDir('crew-projbackup-'), 'out');
  assert.strictEqual(runBackupTool(['backup', '--root', proj, '--dest', dest], { HOME: home }).status, 0);

  const r = runBackupTool(['restore', '--from', dest], { HOME: home });
  assert.strictEqual(r.status, 4, `stdout:\n${r.stdout}\nstderr:\n${r.stderr}`);
  assert.ok(r.stderr.includes(`--root ${proj}`), `the refusal must name the right flag:\n${r.stderr}`);
  assert.doesNotMatch(r.stderr, /Pass --allow-foreign-home only/,
    'the flag that would pour a project installation into this home must not be recommended');
  assert.strictEqual(fs.existsSync(path.join(home, '.triple-crown')), false, 'nothing was written');
});

// I5: R7 은 스코프마다 백업 하나를 요구하고 bin/crew.cjs 는 스코프마다 정확히 이 두 명령을
// 찍는다. 기본 dest 가 같으면 도구 자신의 안내를 따라가던 사용자가 두 번째 단계에서 막힌다.
test('a --root backup and a home backup do not fight over the same default destination', () => {
  const home = mkFakeHome();
  const proj = mkFakeHome();
  const first = runBackupTool(['backup', '--root', proj], { HOME: home });
  assert.strictEqual(first.status, 0, first.stderr);
  const second = runBackupTool(['backup'], { HOME: home });
  assert.strictEqual(second.status, 0,
    `the second command the installer prints must not be blocked by the first:\n${second.stderr}`);

  const dirs = fs.readdirSync(path.join(home, '.crew-legacy-backup')).sort();
  assert.strictEqual(dirs.length, 2, `two scopes, two destinations, got: ${dirs.join(', ')}`);
  assert.ok(dirs.some((d) => d.endsWith(`-${path.basename(proj)}`)),
    `the project destination must carry its root: ${dirs.join(', ')}`);
});

// 이월 11: HOME 만 넘기면 Windows 의 os.homedir() 는 USERPROFILE 을 보고 **진짜 홈**을
// 대상으로 삼는다. 이 파일의 호출은 전부 그 모양이었고, 그중 하나(:222)는 진짜
// non-dry-run restore 다 — 개명 전 설치본이 남은 Windows 개발 머신에서 그 홈을 덮어쓴다.
test('the fixture helper targets the fake home on every platform, not the real one', () => {
  const home = mkFakeHome();
  const r = runBackupTool(['detect'], { HOME: home });
  assert.strictEqual(r.status, 0, r.stderr);
  assert.match(r.stdout, new RegExp(`^home: ${home.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'm'),
    'runBackupTool must mirror HOME into USERPROFILE — os.homedir() reads it on Windows');
});
