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
