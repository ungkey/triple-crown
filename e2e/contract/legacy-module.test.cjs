'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const { ROOT, tempDir } = require('./helpers/repo.cjs');
const { mkFakeHome } = require('./helpers/fake-home.cjs');

const MODULE = path.join(ROOT, 'scripts', 'legacy-backup.cjs');

// require 는 부작용이 없어야 한다. 이 둘 중 하나라도 남으면 bin/crew.cjs 가 이 파일을
// require 하는 순간 설치자의 오류 계약과 argv 해석이 납치된다.
test('requiring the legacy module installs no global handler and parses no argv', () => {
  const probe = `
    const before = process.listenerCount('uncaughtException');
    process.argv = [process.argv[0], 'probe', '--project', '/tmp/x'];
    const api = require(${JSON.stringify(MODULE)});
    console.log(JSON.stringify({
      handlerDelta: process.listenerCount('uncaughtException') - before,
      exports: Object.keys(api).sort(),
    }));
  `;
  const r = cp.spawnSync(process.execPath, ['-e', probe], { encoding: 'utf8', timeout: 30000 });
  assert.strictEqual(r.status, 0, `require threw: ${r.stderr}`);
  const out = JSON.parse(r.stdout);
  assert.strictEqual(out.handlerDelta, 0,
    'legacy-backup.cjs must not register uncaughtException at module load — it would hijack the installer');
  for (const name of ['LEGACY_CAPABILITIES', 'LEGACY_SKILL_MARKERS', 'SKILL_MARKERS', 'SHIP_GUARD',
    'SEMANTIC', 'VENDOR_DIR', 'collectTargets', 'extractFragment', 'extractHookGroup', 'hasShipGuardGroup',
    'findMarkerRange', 'legacySignals', 'verifyArchive']) {
    assert.ok(out.exports.includes(name), `missing export: ${name}`);
  }
});

// CLI 로 직접 실행할 때의 동작은 그대로여야 한다.
test('the CLI still refuses an unknown subcommand with exit 2', () => {
  const r = cp.spawnSync(process.execPath, [MODULE, 'nonsense'], { encoding: 'utf8', timeout: 30000 });
  assert.strictEqual(r.status, 2, r.stdout + r.stderr);
  assert.match(r.stderr, /usage: legacy-backup\.cjs detect/);
});

test('detect still runs against a home directory and always exits 0', () => {
  const home = mkFakeHome();
  const r = cp.spawnSync(process.execPath, [MODULE, 'detect'], {
    encoding: 'utf8', timeout: 30000,
    env: { ...process.env, HOME: home, USERPROFILE: home },
  });
  assert.strictEqual(r.status, 0, r.stderr);
  assert.match(r.stdout, /legacy targets: [1-9]/);
});

// 루트 일반화: 홈이 아닌 디렉터리도 대상이 된다.
test('backup --root takes a project tree instead of the home directory', () => {
  const proj = mkFakeHome();                 // 같은 레이아웃, 위치만 프로젝트
  const dest = path.join(tempDir('crew-backup-dest-'), 'out');
  const r = cp.spawnSync(process.execPath, [MODULE, 'backup', '--root', proj, '--dest', dest], {
    encoding: 'utf8', timeout: 60000,
  });
  assert.strictEqual(r.status, 0, r.stdout + r.stderr);
  const manifest = JSON.parse(fs.readFileSync(path.join(dest, 'MANIFEST.json'), 'utf8'));
  assert.strictEqual(manifest.home, proj, 'the manifest records the root the backup was taken from');
  assert.strictEqual(manifest.scope, 'project');
  assert.ok(manifest.targets.some((t) => t.rel === '.triple-crown'));
});

test('collectTargets can be narrowed to the legacy marker alone', () => {
  const legacy = require(MODULE);
  const root = mkFakeHome();
  const cur = path.join(root, '.claude', 'skills', 'crew-gsd-review');
  fs.mkdirSync(cur, { recursive: true });
  fs.writeFileSync(path.join(cur, '.crew-skill'), 'crew-quality\n');

  const wide = legacy.collectTargets(root).map((t) => t.rel);
  const narrow = legacy.collectTargets(root, [], { markers: legacy.LEGACY_SKILL_MARKERS })
    .map((t) => t.rel);
  assert.ok(wide.includes('.claude/skills/crew-gsd-review'), 'backup captures both markers');
  assert.ok(!narrow.includes('.claude/skills/crew-gsd-review'),
    'removal must never see a current-brand skill');
  assert.ok(narrow.includes('.claude/skills/gsd-triple-crown'));
});

// R1 — fail() 이 process.exit 대신 throw 해야 라이브러리 호출자가 잡을 수 있다.
test('library calls throw instead of exiting the host process', () => {
  const probe = `
    const legacy = require(${JSON.stringify(MODULE)});
    let thrown = null;
    try { legacy.verifyArchive('/definitely/not/a/backup'); }
    catch (e) { thrown = { message: e.message, exitCode: e.exitCode }; }
    console.log(JSON.stringify({ thrown, alive: true }));
  `;
  const r = cp.spawnSync(process.execPath, ['-e', probe], { encoding: 'utf8', timeout: 30000 });
  assert.strictEqual(r.status, 0,
    'verifyArchive must not end the process — checkBackup depends on catching this');
  const out = JSON.parse(r.stdout);
  assert.ok(out.thrown, 'verifyArchive must throw on a missing MANIFEST.json');
  assert.strictEqual(out.thrown.exitCode, 2, 'the CLI exit code must survive as e.exitCode');
});

// R2 — restore --root 는 검증과 쓰기 둘 다 그 루트를 대상으로 해야 한다.
test('restore --root writes into that root and leaves $HOME untouched', () => {
  const proj = mkFakeHome();
  const home = mkFakeHome();                       // 대조군 — 한 바이트도 안 바뀌어야 한다
  const dest = path.join(tempDir('crew-restore-'), 'out');
  assert.strictEqual(cp.spawnSync(process.execPath,
    [MODULE, 'backup', '--root', proj, '--dest', dest], { encoding: 'utf8', timeout: 60000 }).status, 0);

  fs.rmSync(path.join(proj, '.triple-crown'), { recursive: true, force: true });
  const homeBefore = fs.readFileSync(path.join(home, 'CLAUDE.md'), 'utf8');

  const r = cp.spawnSync(process.execPath, [MODULE, 'restore', '--from', dest, '--root', proj], {
    encoding: 'utf8', timeout: 60000,
    env: { ...process.env, HOME: home, USERPROFILE: home },
  });
  assert.strictEqual(r.status, 0, r.stdout + r.stderr);
  assert.ok(fs.existsSync(path.join(proj, '.triple-crown', 'VERSION')), 'restored into --root');
  assert.strictEqual(fs.readFileSync(path.join(home, 'CLAUDE.md'), 'utf8'), homeBefore,
    '$HOME must be untouched when --root points elsewhere');
});
