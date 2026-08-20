'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');

const ROOT = path.join(__dirname, '..', '..');

function copyPackage() {
  const pkg = fs.mkdtempSync(path.join(os.tmpdir(), 'crew-prerelease-'));
  fs.cpSync(ROOT, pkg, {
    recursive: true,
    filter: (src) => {
      const parts = src.split(path.sep);
      return !parts.includes('.git') && !parts.includes('node_modules');
    },
  });
  return pkg;
}

test('prerelease VERSION refuses install without --allow-prerelease', () => {
  const pkg = copyPackage();
  fs.writeFileSync(path.join(pkg, 'VERSION'), '0.7.0-test\n');
  const proj = fs.mkdtempSync(path.join(os.tmpdir(), 'crew-proj-'));
  const run = (args) => cp.spawnSync(
    process.execPath, [path.join(pkg, 'bin', 'triple-crown.cjs'), ...args],
    { encoding: 'utf8' }
  );

  const refused = run(['install', '--yes', '--dry-run', '--project', proj]);
  assert.notStrictEqual(refused.status, 0, 'prerelease install must be refused');
  assert.match(refused.stderr, /prerelease/i);

  const allowed = run(['install', '--yes', '--dry-run', '--project', proj, '--allow-prerelease']);
  assert.strictEqual(allowed.status, 0, allowed.stderr);
  assert.match(allowed.stdout, /DRY RUN/);
});

test('repo tree install behavior matches its own VERSION prerelease state', () => {
  // M0 이후 main의 VERSION은 0.7.0-dev가 되므로, 이 테스트는 상태에 따라
  // 기대를 뒤집는다 — 안정판이면 무플래그 설치 진행, 프리릴리스면 거부.
  const version = fs.readFileSync(path.join(ROOT, 'VERSION'), 'utf8').trim();
  const proj = fs.mkdtempSync(path.join(os.tmpdir(), 'crew-proj-'));
  const r = cp.spawnSync(
    process.execPath,
    [path.join(ROOT, 'bin', 'triple-crown.cjs'), 'install', '--yes', '--dry-run', '--project', proj],
    { encoding: 'utf8' }
  );
  if (version.includes('-')) {
    assert.notStrictEqual(r.status, 0, 'prerelease tree must refuse plain install');
    assert.match(r.stderr, /prerelease/i);
  } else {
    assert.strictEqual(r.status, 0, r.stderr);
    assert.match(r.stdout, /DRY RUN/);
  }
});
