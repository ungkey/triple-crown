'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const { ROOT, tempDir } = require('./helpers/repo.cjs');
const { mkFakeHome } = require('./helpers/fake-home.cjs');

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
