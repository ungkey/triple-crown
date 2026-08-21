'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');
const { copyRepo } = require('./helpers/repo.cjs');

function install(pkg, extra = []) {
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'crew-proj-'));
  return cp.spawnSync(process.execPath, [
    path.join(pkg, 'bin', 'triple-crown.cjs'), 'install',
    '--yes', '--dry-run', '--project', project, '--allow-prerelease', ...extra,
  ], { encoding: 'utf8' });
}
const libDir = (pkg) => path.join(pkg, 'capabilities', 'triple-gstack', 'checks', 'lib');

test('a clean package passes preflight on --dry-run', () => {
  // 이 단언이 없으면 아래 세 테스트는 "설치가 원래 안 되는 것"으로도 통과한다.
  const r = install(copyRepo('crew-clean-'));
  assert.strictEqual(r.status, 0, r.stderr);
  assert.match(r.stdout, /DRY RUN/);
});

test('a tampered lib copy is refused at preflight', () => {
  const pkg = copyRepo('crew-tampered-');
  fs.appendFileSync(path.join(libDir(pkg), 'repo-state-lib.cjs'), '\n// tampered\n');
  const r = install(pkg);
  assert.notStrictEqual(r.status, 0, 'a modified bundled lib must not install');
  assert.match(r.stderr, /sha256 mismatch/);
});

test('an unrecorded file in checks/lib is refused', () => {
  // 기록에 없는 파일은 설치자가 출처를 말할 수 없다. 사본 옆에 조용히 얹히는
  // 추가 모듈이 가장 위험한 형태다 — require 한 줄이면 실행된다.
  const pkg = copyRepo('crew-extra-');
  fs.writeFileSync(path.join(libDir(pkg), 'extra.cjs'), 'module.exports = {};\n');
  const r = install(pkg);
  assert.notStrictEqual(r.status, 0);
  assert.match(r.stderr, /not recorded/);
});

test('a missing recorded file is refused', () => {
  const pkg = copyRepo('crew-gone-');
  fs.rmSync(path.join(libDir(pkg), 'evidence-store.cjs'));
  const r = install(pkg);
  assert.notStrictEqual(r.status, 0);
  assert.match(r.stderr, /recorded but missing/);
});

test('an empty LIB-HASH record is refused rather than passing vacuously', () => {
  // 기록이 비고 사본도 없으면 "기록된 것 검사"와 "기록에 없는 것 검사" 두 루프가 모두
  // 공회전한다 — 사본을 전부 지운 패키지가 통과하고, 게이트가 사용자 세션에서 죽는다.
  const pkg = copyRepo('crew-emptyrec-');
  const dir = libDir(pkg);
  for (const f of fs.readdirSync(dir)) if (f !== 'LIB-HASH.json') fs.rmSync(path.join(dir, f));
  fs.writeFileSync(path.join(dir, 'LIB-HASH.json'),
    JSON.stringify({ schema: 1, generatedFrom: 'lib/', files: {} }, null, 2) + '\n');
  const r = install(pkg);
  assert.notStrictEqual(r.status, 0, 'an empty record must not verify');
  assert.match(r.stderr, /records no files/);
});

test('a malformed record — bad schema, path key, or hash — is refused', () => {
  const H = 'a'.repeat(64);
  const cases = [
    [{ schema: 2, generatedFrom: 'lib/', files: { 'repo-state-lib.cjs': H } }, /schema-1/],
    [{ schema: 1, generatedFrom: 'lib/', files: { '../../bin/triple-crown.cjs': H } }, /not a plain file name/],
    [{ schema: 1, generatedFrom: 'lib/', files: { 'repo-state-lib.cjs': 'nothex' } }, /malformed sha256/],
  ];
  for (const [record, re] of cases) {
    const pkg = copyRepo('crew-badrec-');
    fs.writeFileSync(path.join(libDir(pkg), 'LIB-HASH.json'), JSON.stringify(record, null, 2) + '\n');
    const r = install(pkg);
    assert.notStrictEqual(r.status, 0, `must refuse: ${JSON.stringify(record)}`);
    assert.match(r.stderr, re);
  }
});

test('a checks/lib without a readable LIB-HASH.json is refused', () => {
  const pkg = copyRepo('crew-norec-');
  fs.writeFileSync(path.join(libDir(pkg), 'LIB-HASH.json'), 'not json\n');
  const r = install(pkg);
  assert.notStrictEqual(r.status, 0);
  assert.match(r.stderr, /without a readable schema-1/);
});
