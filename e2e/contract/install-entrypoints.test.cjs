'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');

// Must stay an unescaped literal (no `\/`) so the brand fence's line-level
// masking in e2e/contract/brand-names.test.cjs recognises and strips this
// token before its LEGACY scan runs. Build the regexes from it below instead
// of writing the escaped form inline.
const REPO_PATH = 'ungkey/triple-crown';
const GH = new RegExp(`github:${REPO_PATH}(#[\\w.\\-]+)?`, 'g');
const RAW = new RegExp(`raw\\.githubusercontent\\.com/${REPO_PATH}/([^/]+)/`, 'g');

function shDefaultRef() {
  const m = fs.readFileSync(path.join(ROOT, 'install.sh'), 'utf8')
    .match(/^REF="\$\{CREW_REF:-([^}]+)\}"/m);
  assert.ok(m, 'install.sh default ref constant not found');
  return m[1];
}

function ps1DefaultRef() {
  const m = fs.readFileSync(path.join(ROOT, 'install.ps1'), 'utf8')
    .match(/\$ref = if \(\$env:CREW_REF\) \{ \$env:CREW_REF \} else \{ "([^"]+)" \}/);
  assert.ok(m, 'install.ps1 default ref constant not found');
  return m[1];
}

function releaseVersion() {
  return shDefaultRef().replace(/^v/, '');
}

test('default bootstrap ref is not a branch name', () => {
  for (const ref of [shDefaultRef(), ps1DefaultRef()]) {
    assert.ok(!['main', 'master'].includes(ref), `default ref is a branch: ${ref}`);
  }
});

test('release tree: default ref equals the tag this tree ships as', () => {
  const version = fs.readFileSync(path.join(ROOT, 'VERSION'), 'utf8').trim();
  if (version.includes('-')) return; // prerelease tree: ref stays on the last stable tag
  assert.strictEqual(shDefaultRef(), `v${version}`);
  assert.strictEqual(ps1DefaultRef(), `v${version}`);
});

test('every documented github install example pins the bootstrap tag', () => {
  const ref = shDefaultRef();
  const scanned = ['README.md', 'docs/INSTALLER.md', 'docs/WORKFLOW-GUIDE.md', 'install.sh', 'install.ps1']
    .map((p) => path.join(ROOT, p)).filter((p) => fs.existsSync(p));
  const bad = [];
  for (const p of scanned) {
    fs.readFileSync(p, 'utf8').split('\n').forEach((line, i) => {
      for (const m of line.matchAll(GH)) {
        if (m[1] !== `#${ref}`) bad.push(`${path.relative(ROOT, p)}:${i + 1}: ${m[0]}`);
      }
      for (const m of line.matchAll(RAW)) {
        if (m[1] !== ref) bad.push(`${path.relative(ROOT, p)}:${i + 1}: ref=${m[1]}`);
      }
    });
  }
  assert.deepStrictEqual(bad, [], 'unpinned or mismatched install examples');
});

// 위 테스트는 github:/raw 경로만 본다. tgz 파일명은 그 패턴에 안 걸려서 조용히 낡는다 —
// 실제로 bin/crew.cjs:629의 help() 예시는 소스가 0.6.4일 때까지 0.6.3에 멈춰 있었다.
test('every documented tarball example names the version this tree ships as', () => {
  const version = releaseVersion();
  const scanned = ['README.md', 'docs/INSTALLER.md', 'docs/WORKFLOW-GUIDE.md',
    'install.sh', 'install.ps1', 'bin/crew.cjs']
    .map((p) => path.join(ROOT, p)).filter((p) => fs.existsSync(p));
  const bad = [];
  for (const p of scanned) {
    fs.readFileSync(p, 'utf8').split('\n').forEach((line, i) => {
      for (const m of line.matchAll(/crew-harness-([\w.\-]+)\.tgz/g)) {
        if (m[1] !== version) bad.push(`${path.relative(ROOT, p)}:${i + 1}: ${m[0]} (release=v${version})`);
      }
    });
  }
  assert.deepStrictEqual(bad, [], 'stale tarball filenames');
});

// Neither test above catches a bare `CREW_REF=v0.6.4` literal: it isn't a
// github:/raw path (test 3) and isn't a tgz filename (test 4). Pre-commit both
// docs/INSTALLER.md:106's raw URL and :107's env-var override read v0.6.4 and
// were self-consistent; a partial edit that bumps only the URL leaves a copy-paste
// example that fetches install.sh from one tag and installs a different version.
test('every documented CREW_REF= literal pins the version this tree ships as', () => {
  const version = releaseVersion();
  const scanned = ['README.md', 'docs/INSTALLER.md', 'docs/WORKFLOW-GUIDE.md',
    'install.sh', 'install.ps1', 'bin/crew.cjs']
    .map((p) => path.join(ROOT, p)).filter((p) => fs.existsSync(p));
  const bad = [];
  for (const p of scanned) {
    fs.readFileSync(p, 'utf8').split('\n').forEach((line, i) => {
      for (const m of line.matchAll(/CREW_REF=(v[\w.\-]+)/g)) {
        if (m[1] !== `v${version}`) bad.push(`${path.relative(ROOT, p)}:${i + 1}: ${m[0]} (release=v${version})`);
      }
    });
  }
  assert.deepStrictEqual(bad, [], 'stale CREW_REF= literals');
});
