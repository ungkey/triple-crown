'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const { ROOT, tempDir } = require('./helpers/repo.cjs');

const CLI = path.join(ROOT, 'bin', 'crew.cjs');
const FAKE_GSD = path.join(ROOT, 'tests', 'fake-gsd.cjs');
const { CAPABILITIES } = require(CLI);

// tests/run_installer_smoke.py 와 같은 픽스처 구성: 임시 HOME 에 최소 gstack 레이아웃을
// 심고 --no-bootstrap 으로 탐지 단계를 통과시킨다.
function mkFixture() {
  const base = tempDir('crew-atomicity-');
  const home = path.join(base, 'home');
  const proj = path.join(base, 'project');
  fs.mkdirSync(proj, { recursive: true });
  // detectGstack() requires setup *and* review/SKILL.md inside the gstack source dir
  // itself (":sourcePresent") — separate from the short-id skills/review/SKILL.md
  // checked below. Confirmed against bin/crew.cjs's detectGstack() and mirrored from
  // tests/run_installer_smoke.py's fixture(), which is the one proven to pass detection.
  const gs = path.join(home, '.claude', 'skills', 'gstack');
  fs.mkdirSync(path.join(gs, 'review'), { recursive: true });
  fs.writeFileSync(path.join(gs, 'setup'), '#!/usr/bin/env bash\nexit 0\n');
  fs.writeFileSync(path.join(gs, 'review', 'SKILL.md'), '---\nname: review\n---\n');
  for (const s of ['review', 'qa-only', 'cso', 'canary', 'document-release', 'retro', 'plan-eng-review']) {
    const d = path.join(home, '.claude', 'skills', s);
    fs.mkdirSync(d, { recursive: true });
    fs.writeFileSync(path.join(d, 'SKILL.md'), `---\nname: ${s}\n---\n`);
  }
  const git = (...a) => cp.spawnSync('git',
    ['-c', 'user.name=t', '-c', 'user.email=t@example.invalid', '-C', proj, ...a]);
  git('init', '-q');
  git('commit', '-q', '--allow-empty', '-m', 'base');
  return { home, proj };
}

function install(fx, extraEnv) {
  return cp.spawnSync(process.execPath,
    [CLI, 'install', '--project', fx.proj, '--yes', '--no-bootstrap', '--allow-prerelease'],
    {
      encoding: 'utf8', timeout: 180000,
      env: {
        ...process.env, HOME: fx.home, USERPROFILE: fx.home,
        CREW_GSD_BIN: FAKE_GSD, CREW_ALLOW_UNSUPPORTED_NODE: '1', ...extraEnv,
      },
    });
}

function ledger(proj) {
  const p = path.join(proj, '.fake-gsd-capabilities.json');
  if (!fs.existsSync(p)) return [];
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

test('a mid-loop failure on a fresh install leaves no capability registered', () => {
  const fx = mkFixture();
  const r = install(fx, { FAKE_GSD_FAIL_INSTALL: CAPABILITIES[2] });   // 앞의 둘은 이미 성공한 뒤다
  assert.notStrictEqual(r.status, 0, 'the install must fail');
  assert.deepStrictEqual(ledger(fx.proj).map((x) => x.id), [],
    'a fresh install that failed halfway must leave the ledger empty, not partly populated');
  assert.ok(!fs.existsSync(path.join(fx.proj, '.crew')),
    'the managed source directory must not survive a failed fresh install');
});

test('a failed upgrade rolls the ledger back to the previous generation, not a mix', () => {
  const fx = mkFixture();
  assert.strictEqual(install(fx).status, 0, 'baseline install must succeed');
  const before = ledger(fx.proj).map((x) => `${x.id}:${x.version}`).sort();
  assert.ok(before.length, 'baseline ledger must not be empty');

  const r = install(fx, { FAKE_GSD_FAIL_INSTALL: CAPABILITIES[2] });
  assert.notStrictEqual(r.status, 0, 'the upgrade must fail');

  assert.deepStrictEqual(ledger(fx.proj).map((x) => `${x.id}:${x.version}`).sort(), before,
    'every capability must be back on the generation installed before the failed run');
  assert.ok(fs.existsSync(path.join(fx.proj, '.crew', 'VERSION')),
    'the previous managed source must be restored');
});

test('a failed install tells the user how to get back to a consistent state', () => {
  const fx = mkFixture();
  assert.strictEqual(install(fx).status, 0);
  const r = install(fx, { FAKE_GSD_FAIL_INSTALL: CAPABILITIES[1] });
  assert.notStrictEqual(r.status, 0);
  assert.match(r.stdout + r.stderr, /Rolled the capability ledger back|crew install|capability remove/,
    'the failure output must name either the rollback that happened or the repair path');
});

test('rollback reports a capability the previous generation never had', () => {
  const fx = mkFixture();
  assert.strictEqual(install(fx).status, 0);
  // 이전 세대에 없던 capability 를 흉내낸다: 복구될 소스에서 touched 에 드는 id 하나를 지운다.
  fs.rmSync(path.join(fx.proj, '.crew', 'capabilities', CAPABILITIES[0]), { recursive: true, force: true });
  const r = install(fx, { FAKE_GSD_FAIL_INSTALL: CAPABILITIES[2] });
  assert.notStrictEqual(r.status, 0);
  assert.match(r.stdout + r.stderr, /Rollback could not reinstate/,
    'a capability missing from the restored source must be named, not silently dropped');
});
