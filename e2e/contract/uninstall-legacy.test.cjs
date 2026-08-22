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
