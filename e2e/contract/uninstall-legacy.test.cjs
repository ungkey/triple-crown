'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const { ROOT, tempDir } = require('./helpers/repo.cjs');
const { mkFakeHome, ROUTING_BLOCK } = require('./helpers/fake-home.cjs');

const UNINSTALL = require(path.join(ROOT, 'scripts', 'uninstall-legacy.cjs'));
const BACKUP_CLI = path.join(ROOT, 'scripts', 'legacy-backup.cjs');
const LEGACY_BACKUP = require(path.join(ROOT, 'scripts', 'legacy-backup.cjs'));

function mkBackup(root) {
  const dest = path.join(tempDir('crew-backup-'), 'out');
  const r = cp.spawnSync(process.execPath, [BACKUP_CLI, 'backup', '--root', root, '--dest', dest],
    { encoding: 'utf8', timeout: 60000 });
  assert.strictEqual(r.status, 0, `backup failed: ${r.stdout}${r.stderr}`);
  return dest;
}

// mkFakeHome 이 심는 것: capability 3 + 스킬 1 + 훅 파일 1 + settings 훅 그룹 1
// + CLAUDE.md 마커 블록 1 + 벤더 디렉터리 1 = 8.
const PLANTED = 8;

test('planRemoval finds all six kinds of legacy location in a planted fixture', () => {
  const root = mkFakeHome();
  const plan = UNINSTALL.planRemoval(root);
  assert.deepStrictEqual(plan.capabilities,
    ['triple-gstack', 'triple-superpowers', 'triple-crown-guide']);
  assert.deepStrictEqual(plan.skills, ['.claude/skills/gsd-triple-crown']);
  assert.strictEqual(plan.hookFile, '.claude/hooks/triple-crown-ship-guard.cjs');
  assert.strictEqual(plan.settingsGroup, true);
  assert.ok(plan.routingBlock, 'routing marker block must be located');
  assert.strictEqual(plan.vendorDir, '.triple-crown');
  assert.deepStrictEqual(plan.undetermined, []);
  assert.strictEqual(plan.count, PLANTED);
});

test('planRemoval never targets a current crew skill', () => {
  const root = mkFakeHome();
  const cur = path.join(root, '.claude', 'skills', 'crew-gsd-review');
  fs.mkdirSync(cur, { recursive: true });
  fs.writeFileSync(path.join(cur, '.crew-skill'), 'crew-quality\n');
  assert.deepStrictEqual(UNINSTALL.planRemoval(root).skills,
    ['.claude/skills/gsd-triple-crown'],
    'the current-brand marker must not be a removal target');
});

test('planRemoval on a clean tree reports nothing to do', () => {
  assert.strictEqual(UNINSTALL.planRemoval(tempDir('crew-clean-')).count, 0);
});

test('planRemoval reports an unparseable settings.json as undetermined, not absent', () => {
  const root = mkFakeHome();
  fs.writeFileSync(path.join(root, '.claude', 'settings.json'), '{ not json');
  const plan = UNINSTALL.planRemoval(root);
  assert.ok(plan.undetermined.some((u) => u.includes('settings.json')), plan.undetermined.join('\n'));
});

test('checkBackup refuses when the backup came from a different root', () => {
  const root = mkFakeHome();
  const other = mkBackup(mkFakeHome());
  const res = UNINSTALL.checkBackup(UNINSTALL.planRemoval(root), other);
  assert.strictEqual(res.ok, false);
  assert.ok(res.problems.some((p) => /different root/i.test(p)), res.problems.join('\n'));
});

test('checkBackup accepts a backup taken from the same root', () => {
  const root = mkFakeHome();
  const from = mkBackup(root);
  const res = UNINSTALL.checkBackup(UNINSTALL.planRemoval(root), from);
  assert.deepStrictEqual(res.problems, []);
  assert.strictEqual(res.ok, true);
});

test('checkBackup refuses a backup whose archive no longer matches its manifest', () => {
  const root = mkFakeHome();
  const from = mkBackup(root);
  fs.writeFileSync(path.join(from, 'archive.tar.gz'), 'corrupted');
  const res = UNINSTALL.checkBackup(UNINSTALL.planRemoval(root), from);
  assert.strictEqual(res.ok, false);
  assert.ok(res.problems.length, 'a corrupted archive must produce problems');
});

test('checkBackup refuses when the plan grew a target the backup never saw', () => {
  const root = mkFakeHome();
  const from = mkBackup(root);
  // 백업 이후에 새 레거시 스킬이 생겼다 — 지우면 되돌릴 수 없다.
  const late = path.join(root, '.claude', 'skills', 'gsd-triple-gstack-qa-only');
  fs.mkdirSync(late, { recursive: true });
  fs.writeFileSync(path.join(late, '.triple-crown-skill'), '');
  const res = UNINSTALL.checkBackup(UNINSTALL.planRemoval(root), from);
  assert.strictEqual(res.ok, false);
  assert.ok(res.problems.some((p) => p.includes('gsd-triple-gstack-qa-only')), res.problems.join('\n'));
});

test('checkBackup with no --from is a refusal, not a pass', () => {
  const root = mkFakeHome();
  const res = UNINSTALL.checkBackup(UNINSTALL.planRemoval(root), null);
  assert.strictEqual(res.ok, false);
  assert.ok(res.problems.some((p) => p.includes('--from')), res.problems.join('\n'));
});

// --- CLI 배선: applyRemoval + crew uninstall-legacy --------------------------

const CLI = path.join(ROOT, 'bin', 'crew.cjs');
const FAKE_GSD = path.join(ROOT, 'tests', 'fake-gsd.cjs');

function runCli(args, env) {
  return cp.spawnSync(process.execPath, [CLI, ...args], {
    encoding: 'utf8', timeout: 120000,
    env: { ...process.env, CREW_GSD_BIN: FAKE_GSD, ...env },
  });
}

test('--dry-run writes nothing', () => {
  const root = mkFakeHome();
  const from = mkBackup(root);
  const before = fs.readFileSync(path.join(root, 'CLAUDE.md'), 'utf8');
  const r = runCli(['uninstall-legacy', '--project', root, '--from', from, '--dry-run', '--yes']);
  assert.strictEqual(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /\[dry-run\]/);
  assert.ok(fs.existsSync(path.join(root, '.triple-crown')), 'dry-run must not delete the vendor dir');
  assert.strictEqual(fs.readFileSync(path.join(root, 'CLAUDE.md'), 'utf8'), before);
});

test('without --from the command refuses before touching anything', () => {
  const root = mkFakeHome();
  const r = runCli(['uninstall-legacy', '--project', root, '--yes']);
  assert.strictEqual(r.status, 2, r.stdout + r.stderr);
  assert.match(r.stderr, /--from/);
  assert.ok(fs.existsSync(path.join(root, '.triple-crown')));
});

test('it removes all six locations and preserves everything else', () => {
  const root = mkFakeHome();
  // 사용자 소유물을 심는다 — 이것들이 살아남아야 한다.
  const unmanaged = path.join(root, '.claude', 'skills', 'unmanaged');
  fs.mkdirSync(unmanaged, { recursive: true });
  fs.writeFileSync(path.join(unmanaged, 'SKILL.md'), '---\nname: unmanaged\n---\n');
  const settingsPath = path.join(root, '.claude', 'settings.json');
  const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
  // 레거시 가드와 사용자 훅이 같은 그룹에 있다 — 사용자 훅은 살아남아야 한다.
  settings.hooks.PreToolUse[0].hooks.push({ type: 'command', command: 'node /home/u/shared.cjs' });
  settings.hooks.PreToolUse.push({
    matcher: 'Bash', hooks: [{ type: 'command', command: 'node /home/u/mine.cjs' }],
  });
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n');

  const from = mkBackup(root);
  const r = runCli(['uninstall-legacy', '--project', root, '--from', from, '--yes']);
  assert.strictEqual(r.status, 0, r.stdout + r.stderr);

  // 제거 확인 — 설계 §2.4
  assert.ok(!fs.existsSync(path.join(root, '.triple-crown')), 'vendor dir');
  assert.ok(!fs.existsSync(path.join(root, '.claude', 'hooks', 'triple-crown-ship-guard.cjs')), 'hook file');
  assert.ok(!fs.existsSync(path.join(root, '.claude', 'skills', 'gsd-triple-crown')), 'legacy skill');
  for (const id of ['triple-gstack', 'triple-superpowers', 'triple-crown-guide']) {
    assert.ok(!fs.existsSync(path.join(root, '.gsd', 'capabilities', id)), `capability ${id}`);
  }
  const claudeMd = fs.readFileSync(path.join(root, 'CLAUDE.md'), 'utf8');
  assert.ok(!claudeMd.includes('triple-crown:managed-routing'), 'routing markers');
  assert.ok(!claudeMd.includes('routing body line'), 'routing block body');

  // 보존 확인 — 이쪽이 더 중요하다
  assert.ok(claudeMd.includes('user line kept'), 'user content outside the markers');
  assert.ok(fs.existsSync(unmanaged), 'unmanaged skill');
  const after = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
  assert.strictEqual(after.userSetting, true, 'unrelated settings keys');
  const commands = after.hooks.PreToolUse.flatMap((g) => g.hooks.map((h) => h.command));
  assert.deepStrictEqual(commands.sort(),
    ['node /home/u/mine.cjs', 'node /home/u/shared.cjs'],
    'every non-guard hook survives, including one that shared the guard group');
});

test('running it twice is idempotent', () => {
  const root = mkFakeHome();
  const from = mkBackup(root);
  assert.strictEqual(runCli(['uninstall-legacy', '--project', root, '--from', from, '--yes']).status, 0);
  const second = runCli(['uninstall-legacy', '--project', root, '--from', from, '--yes']);
  assert.strictEqual(second.status, 0, second.stdout + second.stderr);
  assert.match(second.stdout, /nothing to remove/i);
});

test('--global is required to touch the home directory', () => {
  const home = mkFakeHome();
  const proj = tempDir('crew-proj-');
  const r = runCli(['uninstall-legacy', '--project', proj, '--from', mkBackup(home), '--yes'],
    { HOME: home, USERPROFILE: home });
  // 프로젝트는 깨끗하므로 할 일이 없고, 홈은 --global 없이는 대상이 아니다.
  assert.strictEqual(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /nothing to remove/i);
  assert.ok(fs.existsSync(path.join(home, '.triple-crown')), 'home must be untouched without --global');
});

test('undetermined targets block the destructive path', () => {
  const root = mkFakeHome();
  const from = mkBackup(root);
  fs.writeFileSync(path.join(root, '.claude', 'settings.json'), '{ not json');
  const r = runCli(['uninstall-legacy', '--project', root, '--from', from, '--yes']);
  assert.strictEqual(r.status, 2, r.stdout + r.stderr);
  assert.match(r.stderr, /UNDETERMINED/);
  assert.ok(fs.existsSync(path.join(root, '.triple-crown')),
    'nothing may be removed while anything is undetermined');
});

// R5: findMarkerRange 는 첫 쌍만 본다 — 블록이 둘이면 루프를 돌아야 전부 지운다.

test('two legacy routing blocks are both removed and nothing survives', () => {
  const root = mkFakeHome();
  const p = path.join(root, 'CLAUDE.md');
  fs.writeFileSync(p, fs.readFileSync(p, 'utf8') + '\n' + ROUTING_BLOCK + '\ntail line\n');
  const from = mkBackup(root);
  const r = runCli(['uninstall-legacy', '--project', root, '--from', from, '--yes']);
  assert.strictEqual(r.status, 0, r.stdout + r.stderr);
  const md = fs.readFileSync(p, 'utf8');
  assert.ok(!md.includes('triple-crown:managed-routing'), 'no marker may survive');
  assert.ok(!md.includes('routing body line'), 'the block body must go with the markers');
  assert.ok(md.includes('user line kept') && md.includes('tail line'), 'user content on both sides');
});

test('the marker range guard tolerates a CLAUDE.md that lost its markers mid-flight', () => {
  const { planRemoval, applyRemoval } = require(path.join(ROOT, 'scripts', 'uninstall-legacy.cjs'));
  const root = mkFakeHome();
  const plan = planRemoval(root);
  assert.ok(plan.routingBlock, 'fixture must start with a routing block');
  // plan 과 apply 사이에 사용자가 손으로 블록을 지웠다.
  fs.writeFileSync(path.join(root, 'CLAUDE.md'), 'only a user line\n');
  const res = applyRemoval(plan, { runner: null, scope: 'project', run: () => ({ code: 0 }) });
  assert.strictEqual(fs.readFileSync(path.join(root, 'CLAUDE.md'), 'utf8'), 'only a user line\n',
    'splice(-1, 1) must never reach the file');
  assert.ok(res.failures.some((f) => f.includes('vanished')), res.failures.join('\n'));
});

// R7: --from 은 스코프당 하나. 프로젝트와 홈 양쪽에 레거시가 있으면 백업도 둘이 필요하다.

test('--global with legacy in both scopes takes one backup per scope', () => {
  const home = mkFakeHome();
  const proj = mkFakeHome();
  const r = runCli(['uninstall-legacy', '--project', proj, '--global', '--yes',
    '--from', mkBackup(proj), '--from-global', mkBackup(home)], { HOME: home, USERPROFILE: home });
  assert.strictEqual(r.status, 0, r.stdout + r.stderr);
  assert.ok(!fs.existsSync(path.join(proj, '.triple-crown')), 'project vendor dir');
  assert.ok(!fs.existsSync(path.join(home, '.triple-crown')), 'home vendor dir');
});

// R8 / Ruling P4: 실패 경로와 탈출구.

test('--skip-backup-check removes without a backup and says so', () => {
  const root = mkFakeHome();
  const r = runCli(['uninstall-legacy', '--project', root, '--skip-backup-check', '--yes']);
  assert.strictEqual(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stderr, /skip-backup-check/);
  assert.ok(!fs.existsSync(path.join(root, '.triple-crown')));
});

// Ruling P4: 이 머신에서는 CREW_GSD_BIN 이 없는 파일을 가리켜도 resolveGsd() 가 PATH의
// gsd/gsd-tools 나 ~/.claude/gsd-core/bin/gsd-tools.cjs 로 넘어가 null 을 주지 않는다
// (실측). CLI 로 이 경로를 강제하면 진짜 GSD 가 돌아버리므로, runner:null 을 직접 넣는
// 단위 테스트로 "GSD 없음"을 재현한다.
test('an unreachable GSD CLI is a reported failure, not a silent skip', () => {
  const { planRemoval, applyRemoval } = require(path.join(ROOT, 'scripts', 'uninstall-legacy.cjs'));
  const root = mkFakeHome();
  const res = applyRemoval(planRemoval(root), {
    runner: null,
    scope: 'project',
    run: () => { throw new Error('run must not be called when there is no runner'); },
  });
  assert.strictEqual(res.failures.length, 3, res.failures.join('\n'));
  for (const f of res.failures) assert.match(f, /capability left registered/);
  // 원장은 못 건드렸지만 파일 제거는 끝났다 — 재실행하면 원장만 남는다.
  assert.ok(!fs.existsSync(path.join(root, '.triple-crown')));
});

test('a failing capability remove is surfaced with the id that failed', () => {
  const { planRemoval, applyRemoval } = require(path.join(ROOT, 'scripts', 'uninstall-legacy.cjs'));
  const root = mkFakeHome();
  const res = applyRemoval(planRemoval(root), {
    runner: { display: 'stub', cmd: 'stub', prefix: [] },
    scope: 'project',
    run: (_r, args) => args[2] === 'triple-superpowers'
      ? { code: 1, stdout: '', stderr: 'ledger is locked' }
      : { code: 0, stdout: '', stderr: '' },
  });
  assert.strictEqual(res.failures.length, 1, res.failures.join('\n'));
  assert.match(res.failures[0], /triple-superpowers: ledger is locked/);
});

// --- 리뷰 라운드 1 수정 -------------------------------------------------------

// F1: count 는 판정된 대상만 센다. undetermined 가 유일한 신호일 때도 "할 일 없음"을
// 말하면 안 된다 — 그건 "모른다"를 "없다"로 읽는 것이다.
test('a tree whose only legacy signal is undetermined never reports nothing to remove', () => {
  const root = tempDir('crew-clean-');
  // CLAUDE.md 를 디렉터리로 만들어 읽기 실패(EISDIR)를 유도한다 — 판정 불가지, 부재가 아니다.
  fs.mkdirSync(path.join(root, 'CLAUDE.md'));
  const r = runCli(['uninstall-legacy', '--project', root, '--yes']);
  assert.strictEqual(r.status, 2, r.stdout + r.stderr);
  assert.match(r.stderr, /UNDETERMINED/);
  assert.doesNotMatch(r.stdout, /nothing to remove/i);
});

// F2: 같은 트리를 문자열로만 비교하면 symlink 로 도달한 홈을 다른 트리로 오판해
// 두 번 계획하고 두 번 파괴한다. realpath 비교(sameRealPath)로 고쳤다 — 평범한
// 동일 경로 케이스와 심볼릭 링크 케이스 둘 다 "정확히 한 번"을 단언한다.
test('--global with --project pointing at $HOME removes it exactly once', () => {
  const home = mkFakeHome();
  const from = mkBackup(home);
  const r = runCli(['uninstall-legacy', '--project', home, '--global', '--yes', '--from', from],
    { HOME: home, USERPROFILE: home });
  assert.strictEqual(r.status, 0, r.stdout + r.stderr);
  assert.ok(!fs.existsSync(path.join(home, '.triple-crown')));
  assert.strictEqual((r.stdout.match(/remove \.triple-crown\b/g) || []).length, 1,
    'vendor dir removal must be planned exactly once, not once per (mis-detected) scope');
});

test('--global with --project reaching $HOME through a symlink still removes it exactly once', () => {
  const home = mkFakeHome();
  const alias = path.join(tempDir('crew-alias-'), 'home-link');
  try {
    fs.symlinkSync(home, alias, 'dir');
  } catch {
    // 이 플랫폼에서 심볼릭 링크를 만들 수 없다 — 위 동일 경로 테스트만 이 사실을 커버한다.
    return;
  }
  const from = mkBackup(alias);
  const r = runCli(['uninstall-legacy', '--project', alias, '--global', '--yes', '--from', from],
    { HOME: home, USERPROFILE: home });
  assert.strictEqual(r.status, 0, r.stdout + r.stderr);
  assert.ok(!fs.existsSync(path.join(home, '.triple-crown')));
  assert.strictEqual((r.stdout.match(/remove \.triple-crown\b/g) || []).length, 1,
    'realpath-equal scopes (symlink and its target) must collapse to a single plan');
});

// F3: 전체 버퍼에 정규식을 돌리면 마커 밖의 빈 줄 뭉치(펜스 코드 블록 안쪽 포함)까지
// 사용자 모르게 뭉개진다. 이제 접합부만 정규화하므로 손대지 않은 구간은 바이트 그대로다.
test('CLAUDE.md content outside the marker pair survives byte-for-byte', () => {
  const root = mkFakeHome();
  const p = path.join(root, 'CLAUDE.md');
  const before = fs.readFileSync(p, 'utf8');
  // 마커 밖에 사용자가 쓴 3중 개행과, 빈 줄이 있는 펜스 코드 블록을 더한다.
  const userTail = '\n\n\n```js\nfunction f() {\n\n  return 1;\n}\n```\n\n\ntrailer\n';
  fs.writeFileSync(p, before + userTail);
  const from = mkBackup(root);
  const r = runCli(['uninstall-legacy', '--project', root, '--from', from, '--yes']);
  assert.strictEqual(r.status, 0, r.stdout + r.stderr);
  const after = fs.readFileSync(p, 'utf8');
  assert.ok(after.endsWith(userTail),
    'content outside the marker pair must be byte-identical, including its blank-line runs and fenced code');
  assert.ok(!after.includes('triple-crown:managed-routing'));
});

// F4: --dry-run 은 아무것도 쓰지 않는 미리보기여야 한다. runner 가 없다고 실패를
// 보고하면 유일하게 안전한 미리보기 경로가 "실패로 끝나는 실행"이 되어 버린다.
test('dry run with no GSD runner narrates capability removals without failing', () => {
  const { planRemoval, applyRemoval } = require(path.join(ROOT, 'scripts', 'uninstall-legacy.cjs'));
  const root = mkFakeHome();
  const res = applyRemoval(planRemoval(root), {
    runner: null,
    scope: 'project',
    dryRun: true,
    run: () => { throw new Error('run must not be called during a dry run'); },
  });
  assert.deepStrictEqual(res.failures, []);
  for (const id of ['triple-gstack', 'triple-superpowers', 'triple-crown-guide']) {
    assert.ok(res.actions.some((a) => a.includes(`capability remove ${id}`)), res.actions.join('\n'));
  }
});

// F5: 훅을 하나도 못 걷어냈으면 파일을 다시 쓸 이유가 없다 — CLAUDE.md 의 사후 조건과
// 대칭이다. plan 과 apply 사이에 사용자가 손으로 훅을 지운 경우를 재현한다.
test('the settings.json hook removal tolerates a hook that vanished mid-flight', () => {
  const { planRemoval, applyRemoval } = require(path.join(ROOT, 'scripts', 'uninstall-legacy.cjs'));
  const root = mkFakeHome();
  const plan = planRemoval(root);
  assert.strictEqual(plan.settingsGroup, true, 'fixture must start with a ship-guard hook group');
  const settingsPath = path.join(root, '.claude', 'settings.json');
  const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
  settings.hooks.PreToolUse = [];
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n');
  const beforeText = fs.readFileSync(settingsPath, 'utf8');
  const res = applyRemoval(plan, { runner: null, scope: 'project', run: () => ({ code: 0 }) });
  assert.strictEqual(fs.readFileSync(settingsPath, 'utf8'), beforeText,
    'a no-op removal must never rewrite the file');
  assert.ok(res.failures.some((f) => f.includes('vanished')), res.failures.join('\n'));
});

// F6: 흔한 실패(GSD 접근 불가)는 원장이 이미 지워진 파일을 계속 가리키게 둔다.
// 출력이 되돌리는 방법(재실행 또는 백업 복원)을 말해야 한다.
test('a capability removal failure names the recovery path in its output', () => {
  const root = mkFakeHome();
  const from = mkBackup(root);
  const failingGsd = path.join(tempDir('crew-failing-gsd-'), 'failing-gsd.cjs');
  fs.writeFileSync(failingGsd,
    "#!/usr/bin/env node\nconsole.error('ledger is locked');\nprocess.exit(1);\n");
  const r = runCli(['uninstall-legacy', '--project', root, '--from', from, '--yes'],
    { CREW_GSD_BIN: failingGsd });
  assert.strictEqual(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stderr, /Recovery:/);
  assert.match(r.stderr, /re-run/i);
  assert.match(r.stderr, /restore/i);
});

// F7: 스코프별 플래그 이름이 실제로 갈리는지. 홈 스코프의 거부는 --from 이 아니라
// --from-global 을 지목해야 한다.
test('the backup-check refusal for the home scope names --from-global, not --from', () => {
  const home = mkFakeHome();
  const proj = mkFakeHome();
  const r = runCli(['uninstall-legacy', '--project', proj, '--global', '--yes',
    '--from', mkBackup(proj)], { HOME: home, USERPROFILE: home });
  assert.strictEqual(r.status, 2, r.stdout + r.stderr);
  assert.match(r.stderr, /--from-global/);
});

// --- 리뷰 라운드 2 — F3 재오픈: 접합부 정규화가 여전히 마커 밖 바이트를 건드렸다 ------
//
// 이 아래 테스트들은 mkFakeHome 을 쓰지 않는다 — 그 픽스처는 마커 블록을 항상 파일의
// 절대 시작에 놓아서, "블록이 파일 끝(마지막 내용)일 때" 경로가 한 번도 실행되지
// 않았다. 정확한 바이트를 손으로 통제하려고 손으로 쓴 CLAUDE.md 를 applyRemoval 에
// 직접 물린다.

const { ROUTING_START, ROUTING_END } = LEGACY_BACKUP;

// planRemoval 이 routingBlock 하나만 참이 되는 최소 트리를 만든다(다른 다섯 종류는
// 심지 않는다) — 그러면 applyRemoval 의 1~4·6 단계는 전부 no-op 이고 5 단계(CLAUDE.md)
// 의 바이트 결과만 격리해서 볼 수 있다.
function planAndApplyClaudeMd(content) {
  const root = tempDir('crew-claudemd-');
  fs.writeFileSync(path.join(root, 'CLAUDE.md'), content);
  const { planRemoval, applyRemoval } = require(path.join(ROOT, 'scripts', 'uninstall-legacy.cjs'));
  const plan = planRemoval(root);
  assert.ok(plan.routingBlock, 'fixture must contain a routing block');
  assert.strictEqual(plan.count, 1, 'fixture must plant nothing besides the routing block');
  const res = applyRemoval(plan, { runner: null, scope: 'project', run: () => ({ code: 0 }) });
  const p = path.join(root, 'CLAUDE.md');
  const after = fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null;
  return { after, failures: res.failures };
}

test('a routing block at end-of-file, preceded by a blank line, leaves exactly that blank line behind', () => {
  // 회귀 재현 사례 그대로: 마커가 파일의 마지막 내용이고, 그 앞에 사용자가 둔 빈 줄이
  // 하나 있다. 예전 버그는 이 빈 줄을 split('\n') 이 만드는 EOF 아티팩트와 뭉개서
  // "intro line\n" 으로 줄였다 — 정답은 "intro line\n\n" (빈 줄이 살아남는다).
  const before = `intro line\n\n${ROUTING_START}\n## routing\nrouting body line\n${ROUTING_END}\n`;
  const { after, failures } = planAndApplyClaudeMd(before);
  assert.strictEqual(after, 'intro line\n\n');
  assert.deepStrictEqual(failures, []);
});

test('a routing block at the very start of the file leaves the exact tail behind, byte for byte', () => {
  const before = `${ROUTING_START}\n## routing\nrouting body line\n${ROUTING_END}\n\n# user heading\nuser line kept\n`;
  const { after, failures } = planAndApplyClaudeMd(before);
  assert.strictEqual(after, '\n# user heading\nuser line kept\n');
  assert.deepStrictEqual(failures, []);
});

test('two routing blocks removed in one run, the second at end-of-file, leave exact surviving bytes', () => {
  const before = `intro\n\n${ROUTING_START}\n## routing\nbody1\n${ROUTING_END}\n\nmiddle\n\n`+
    `${ROUTING_START}\n## routing\nbody2\n${ROUTING_END}\n`;
  const { after, failures } = planAndApplyClaudeMd(before);
  assert.strictEqual(after, 'intro\n\nmiddle\n\n');
  assert.deepStrictEqual(failures, []);
});

test('a CLAUDE.md with no trailing newline keeps that property intact after removal', () => {
  const before = `intro\n\n${ROUTING_START}\n## routing\nbody\n${ROUTING_END}\n\ntrailer without newline`;
  const { after, failures } = planAndApplyClaudeMd(before);
  assert.strictEqual(after, 'intro\n\ntrailer without newline');
  assert.deepStrictEqual(failures, []);
});

// --- 최종 전체 리뷰 수정 ------------------------------------------------------

const crypto = require('crypto');

// chmod 555 는 root 에게 무효다 — root 로 도는 컨테이너에서는 권한 거부를 실제로 일으킬 수
// 없으므로 조용한 vacuous pass 대신 명시적 skip 한다 (legacy-backup.test.cjs 와 같은 규약).
const IS_ROOT = typeof process.getuid === 'function' && process.getuid() === 0;
const ROOT_SKIP = 'chmod 555 does not deny root — this test needs a non-root uid';

// 트리 전체를 바이트 단위로 찍는다 — 파일 내용의 sha256, 디렉터리, 심볼릭 링크 대상까지.
// "어떤 문자열이 살아남았다"가 아니라 "왕복이 제자리로 돌아왔다"를 단언하기 위한 것이다.
function snapshotTree(root, skip = new Set()) {
  const out = {};
  (function walk(abs, rel) {
    for (const e of fs.readdirSync(abs, { withFileTypes: true })
      .sort((a, b) => (a.name < b.name ? -1 : 1))) {
      const p = path.join(abs, e.name);
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (skip.has(r)) continue;
      if (e.isSymbolicLink()) out[r] = `symlink:${fs.readlinkSync(p)}`;
      else if (e.isDirectory()) { out[r] = 'dir'; walk(p, r); }
      else out[r] = crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
    }
  })(root, '');
  return out;
}

// tests/fake-gsd.cjs 가 cwd 에 쓰는 자기 원장. 진짜 GSD 원장(.gsd/capabilities/*)이 아니라
// 테스트 러너의 부산물이므로 백업 대상도, 복구 대상도 아니다.
const FAKE_GSD_LEDGER = '.fake-gsd-capabilities.json';

function roundTrip(root) {
  const before = snapshotTree(root);
  const from = mkBackup(root);
  const removed = runCli(['uninstall-legacy', '--project', root, '--from', from, '--yes']);
  assert.strictEqual(removed.status, 0, removed.stdout + removed.stderr);
  assert.ok(!fs.existsSync(path.join(root, '.triple-crown')), 'the removal must actually have run');
  const restored = cp.spawnSync(process.execPath,
    [BACKUP_CLI, 'restore', '--from', from, '--root', root], { encoding: 'utf8', timeout: 60000 });
  assert.strictEqual(restored.status, 0, restored.stdout + restored.stderr);
  return { before, after: snapshotTree(root, new Set([FAKE_GSD_LEDGER])), from };
}

// I4 (2): 이 명령의 안전 논거 전체가 "백업 게이트가 있으니 되돌릴 수 있다"인데, 그것을
// 실제로 끝까지 검증하는 테스트가 브랜치에 하나도 없었다. backup → 제거 → restore --root
// 를 돌리고 트리가 바이트 동일하게 돌아오는지 본다.
test('backup, uninstall-legacy and restore round-trip the tree byte-for-byte', () => {
  const root = mkFakeHome();
  const { before, after } = roundTrip(root);
  assert.deepStrictEqual(after, before,
    'every byte the removal took must come back from the backup it was gated on');
});

// I4 (1): 제거는 훅 단위(그룹은 남기고 가드 훅만 빼냄)인데 복구가 그룹 단위(보존해 둔 그룹을
// 통째로 append)였다. 가드와 같은 그룹을 쓰던 사용자 훅이 왕복 후 두 벌이 되어 Bash 호출마다
// 두 번 돌았다 — R6 이 보호하려고 쓴 바로 그 트리 모양이다.
test('a guard hook that shared its group round-trips without duplicating the user hook', () => {
  const root = mkFakeHome();
  const settingsPath = path.join(root, '.claude', 'settings.json');
  const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
  settings.hooks.PreToolUse[0].hooks.push({ type: 'command', command: 'node /home/u/shared.cjs' });
  settings.hooks.PreToolUse.push({
    matcher: 'Bash', hooks: [{ type: 'command', command: 'node /home/u/mine.cjs' }],
  });
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n');

  const { before, after } = roundTrip(root);
  assert.deepStrictEqual(after, before, 'settings.json must come back byte-identical, not re-appended');

  const commands = JSON.parse(fs.readFileSync(settingsPath, 'utf8'))
    .hooks.PreToolUse.flatMap((g) => g.hooks.map((h) => h.command));
  assert.strictEqual(commands.filter((c) => c === 'node /home/u/shared.cjs').length, 1,
    'the user hook that shared the guard group must run once per Bash call, not twice');
  assert.strictEqual(commands.filter((c) => c.includes('ship-guard')).length, 1,
    'exactly one guard registration comes back');
});

// C1: 이 명령의 기본 스코프는 프로젝트인데 `restore` 의 기본 대상은 os.homedir() 다. 안내에서
// --root 가 빠지면, 그대로 따라간 사용자가 프로젝트의 개명 전 설치본을 $HOME 에 쏟는다.
test('the recovery instruction carries the root the removal actually ran against', () => {
  const root = mkFakeHome();
  const from = mkBackup(root);
  const failingGsd = path.join(tempDir('crew-failing-gsd-'), 'failing-gsd.cjs');
  fs.writeFileSync(failingGsd,
    "#!/usr/bin/env node\nconsole.error('ledger is locked');\nprocess.exit(1);\n");
  const r = runCli(['uninstall-legacy', '--project', root, '--from', from, '--yes'],
    { CREW_GSD_BIN: failingGsd });
  assert.strictEqual(r.status, 1, r.stdout + r.stderr);
  assert.ok(r.stderr.includes(`restore --from ${from} --root ${root}`),
    `the recovery command must name this scope's root:\n${r.stderr}`);
});

// 이월 12.1: 백업 시각을 거부 메시지와 성공 메시지 양쪽에 찍는다. 백업이 여러 세대 쌓인
// 홈에서는 경로만으로 "지금 이 제거를 덮는 것"을 못 가린다.
test('a successful removal prints how to undo it, and when that backup was taken', () => {
  const root = mkFakeHome();
  const from = mkBackup(root);
  const r = runCli(['uninstall-legacy', '--project', root, '--from', from, '--yes']);
  assert.strictEqual(r.status, 0, r.stdout + r.stderr);
  assert.ok(r.stdout.includes(`restore --from ${from} --root ${root}`),
    `the success output must name the way back:\n${r.stdout}`);
  assert.match(r.stdout, /backup taken \d{4}-\d{2}-\d{2}T/, 'with the backup timestamp');
});

test('the backup-check refusal says when the backup it did read was taken', () => {
  const root = mkFakeHome();
  const foreign = mkBackup(mkFakeHome());
  const r = runCli(['uninstall-legacy', '--project', root, '--from', foreign, '--yes']);
  assert.strictEqual(r.status, 2, r.stdout + r.stderr);
  assert.match(r.stderr, /was taken \d{4}-\d{2}-\d{2}T/, r.stderr);
});

// 이월 12.2: docs/RENAME-MAP.md 는 이 사실을 적었지만 help() 는 아니었다.
test('help says a tree with nothing to remove needs no backup at all', () => {
  const r = runCli(['help']);
  assert.strictEqual(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /nothing to remove/i);
});

// I2: 제거 도중의 I/O 오류가 던지면 uninstallLegacy 를 통째로 빠져나가 failures 집계도
// `Recovery:` 블록도 함께 건너뛴다 — 이미 지운 것이 있는데 백업 이야기는 한 마디도 없다.
// 리뷰어의 실측 3종을 그대로 재현한다.
test('an I/O error inside a removal step lands in failures instead of escaping', () => {
  const cases = [
    ['settings.json deleted', (root) => fs.rmSync(path.join(root, '.claude', 'settings.json')),
      /settings\.json/],
    ['settings.json corrupted',
      (root) => fs.writeFileSync(path.join(root, '.claude', 'settings.json'), '{ not json'),
      /settings\.json/],
    ['CLAUDE.md deleted', (root) => fs.rmSync(path.join(root, 'CLAUDE.md')), /CLAUDE\.md/],
  ];
  for (const [name, breakIt, expected] of cases) {
    const root = mkFakeHome();
    const plan = UNINSTALL.planRemoval(root);
    breakIt(root);                                     // plan 과 apply 사이에서 벌어진 일
    const res = UNINSTALL.applyRemoval(plan, {
      runner: null, scope: 'project', run: () => ({ code: 0 }),
    });
    assert.ok(res.failures.some((f) => expected.test(f)),
      `${name}: the failure must be reported, got ${JSON.stringify(res.failures)}`);
    assert.ok(!fs.existsSync(path.join(root, '.triple-crown')),
      `${name}: a failed step must not stop the steps after it`);
  }
});

test('an unwritable hook file is a reported failure with the recovery block intact', (t) => {
  if (IS_ROOT) { t.skip(ROOT_SKIP); return; }
  const root = mkFakeHome();
  const from = mkBackup(root);
  const hooksDir = path.join(root, '.claude', 'hooks');
  fs.chmodSync(hooksDir, 0o555);                        // 삭제가 EACCES 로 죽는다
  try {
    const r = runCli(['uninstall-legacy', '--project', root, '--from', from, '--yes']);
    assert.strictEqual(r.status, 1, r.stdout + r.stderr);
    assert.match(r.stderr, /Recovery:/,
      `an I/O failure must still print the way back:\n${r.stdout}\n${r.stderr}`);
    assert.ok(r.stderr.includes(`restore --from ${from} --root ${root}`), r.stderr);
    assert.ok(!fs.existsSync(path.join(root, '.triple-crown')),
      'the steps after the failing one still run');
  } finally {
    fs.chmodSync(hooksDir, 0o755);                      // tempDir 정리가 지울 수 있게 되돌린다
  }
});

// I3: 등록을 지우기 전에 훅 파일을 지우면, 그 사이의 settings.json 은 없는 파일을 가리키는
// PreToolUse 훅을 들고 있다 — 사용자가 손볼 때까지 Bash 호출마다 훅 오류가 난다.
test('the settings.json registration is removed before the file it points at', () => {
  const res = UNINSTALL.applyRemoval(UNINSTALL.planRemoval(mkFakeHome()), {
    runner: null, scope: 'project', run: () => ({ code: 0 }),
  });
  const reg = res.actions.findIndex((a) => a.includes('.claude/settings.json'));
  const file = res.actions.findIndex((a) => a.includes('remove .claude/hooks/'));
  assert.ok(reg !== -1 && file !== -1 && reg < file,
    `unregister must precede delete:\n${res.actions.join('\n')}`);
});

test('a settings.json that cannot be edited leaves the hook file it registers in place', () => {
  const root = mkFakeHome();
  const plan = UNINSTALL.planRemoval(root);
  fs.writeFileSync(path.join(root, '.claude', 'settings.json'), '{ not json');
  const res = UNINSTALL.applyRemoval(plan, {
    runner: null, scope: 'project', run: () => ({ code: 0 }),
  });
  assert.ok(fs.existsSync(path.join(root, '.claude', 'hooks', 'triple-crown-ship-guard.cjs')),
    'never delete a file while a registration may still point at it');
  assert.ok(res.failures.some((f) => f.includes('left in place')), res.failures.join('\n'));
  assert.ok(!fs.existsSync(path.join(root, '.triple-crown')), 'the remaining steps still run');
});
