'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const { tempDir } = require('./helpers/repo.cjs');

const ROOT = path.join(__dirname, '..', '..');
const CLI = path.join(ROOT, 'bin', 'crew.cjs');

test('installer refuses $HOME as project root', () => {
  const fakeHome = tempDir('crew-home-');
  const run = (args) => cp.spawnSync(process.execPath, [CLI, ...args], {
    encoding: 'utf8',
    env: { ...process.env, HOME: fakeHome },
  });

  // VERSION 이 프리릴리스인 동안에는 최상단 펜스가 먼저 터져 $HOME 펜스에 닿지 못한다.
  // 이 테스트의 대상은 $HOME 거부이므로 프리릴리스 펜스는 명시적으로 연다.
  const refused = run(['install', '--yes', '--dry-run', '--allow-prerelease', '--project', fakeHome]);
  assert.strictEqual(refused.status, 4,
    `installing into $HOME must be refused with the documented code 4:\n${refused.stderr}`);
  assert.match(refused.stderr, /\$HOME/);

  const proj = tempDir('crew-proj-');
  const ok = run(['install', '--yes', '--dry-run', '--allow-prerelease', '--project', proj]);
  assert.strictEqual(ok.status, 0, ok.stderr);
  assert.match(ok.stdout, /DRY RUN/);
});
