'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
const CLI = path.join(ROOT, 'bin', 'triple-crown.cjs');

test('installer refuses $HOME as project root', () => {
  const fakeHome = fs.mkdtempSync(path.join(os.tmpdir(), 'crew-home-'));
  const run = (args) => cp.spawnSync(process.execPath, [CLI, ...args], {
    encoding: 'utf8',
    env: { ...process.env, HOME: fakeHome },
  });

  const refused = run(['install', '--yes', '--dry-run', '--project', fakeHome]);
  assert.strictEqual(refused.status, 4,
    `installing into $HOME must be refused with the documented code 4:\n${refused.stderr}`);
  assert.match(refused.stderr, /\$HOME/);

  const proj = fs.mkdtempSync(path.join(os.tmpdir(), 'crew-proj-'));
  const ok = run(['install', '--yes', '--dry-run', '--project', proj]);
  assert.strictEqual(ok.status, 0, ok.stderr);
  assert.match(ok.stdout, /DRY RUN/);
});
