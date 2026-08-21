'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const { ROOT, copyRepo, tempDir } = require('./helpers/repo.cjs');

test('prerelease VERSION refuses install without --allow-prerelease', () => {
  const pkg = copyRepo('crew-prerelease-');
  fs.writeFileSync(path.join(pkg, 'VERSION'), '0.7.0-test\n');
  // Task 5 moved the capability-manifest preflight ahead of the --dry-run return, so it
  // now runs here too. Keep the capability manifests in lockstep with VERSION so this
  // fixture stays a self-consistent package — otherwise the (unrelated) manifest
  // version-agreement check rejects it for version drift, not for the prerelease fence
  // this test is actually about.
  // 디스크를 읽는다. id 를 리터럴로 열거하면 capability 가 늘어날 때 이 테스트만 조용히
  // 낡아 프리릴리스 펜스가 아니라 버전 불일치를 검사하게 된다.
  for (const id of fs.readdirSync(path.join(pkg, 'capabilities'), { withFileTypes: true })
    .filter((e) => e.isDirectory()).map((e) => e.name)) {
    const capFile = path.join(pkg, 'capabilities', id, 'capability.json');
    const cap = JSON.parse(fs.readFileSync(capFile, 'utf8'));
    cap.version = '0.7.0-test';
    fs.writeFileSync(capFile, JSON.stringify(cap, null, 2) + '\n');
  }
  const proj = tempDir('crew-proj-');
  const run = (args) => cp.spawnSync(
    process.execPath, [path.join(pkg, 'bin', 'crew.cjs'), ...args],
    { encoding: 'utf8' }
  );

  const refused = run(['install', '--yes', '--dry-run', '--project', proj]);
  assert.strictEqual(refused.status, 4,
    `prerelease install must be refused with the documented code 4:\n${refused.stderr}`);
  assert.match(refused.stderr, /prerelease/i);

  const allowed = run(['install', '--yes', '--dry-run', '--project', proj, '--allow-prerelease']);
  assert.strictEqual(allowed.status, 0, allowed.stderr);
  assert.match(allowed.stdout, /DRY RUN/);
});

test('repo tree install behavior matches its own VERSION prerelease state', () => {
  // M0 이후 main의 VERSION은 0.7.0-dev가 되므로, 이 테스트는 상태에 따라
  // 기대를 뒤집는다 — 안정판이면 무플래그 설치 진행, 프리릴리스면 거부.
  const version = fs.readFileSync(path.join(ROOT, 'VERSION'), 'utf8').trim();
  const proj = tempDir('crew-proj-');
  const r = cp.spawnSync(
    process.execPath,
    [path.join(ROOT, 'bin', 'crew.cjs'), 'install', '--yes', '--dry-run', '--project', proj],
    { encoding: 'utf8' }
  );
  if (version.includes('-')) {
    assert.strictEqual(r.status, 4, `prerelease tree must refuse plain install with 4:\n${r.stderr}`);
    assert.match(r.stderr, /prerelease/i);
  } else {
    assert.strictEqual(r.status, 0, r.stderr);
    assert.match(r.stdout, /DRY RUN/);
  }
});
