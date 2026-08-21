'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const { copyRepo, tempDir } = require('./helpers/repo.cjs');
// build-capabilities 가 실제로 무엇을 어디에 심는지가 단일 진실이다. 테스트가 자기 목록을
// 따로 들면 capability 가 늘어날 때 조용히 낡고, 낡은 채로 계속 초록이다.
const { LIB_MAP } = require('../../scripts/build-capabilities.cjs');

function install(pkg, extra = []) {
  const project = tempDir('crew-proj-');
  return cp.spawnSync(process.execPath, [
    path.join(pkg, 'bin', 'crew.cjs'), 'install',
    '--yes', '--dry-run', '--project', project, '--allow-prerelease', ...extra,
  ], { encoding: 'utf8' });
}
const libDir = (pkg, capId) => path.join(pkg, 'capabilities', capId, 'checks', 'lib');
// 루프는 test() 안에 둔다. test() 를 루프로 감싸면 테스트 개수가 capability 수만큼
// 늘어나 L1 총계 게이트가 무의미해진다.
const CAP_IDS = Object.keys(LIB_MAP);
// 어느 capability 에나 실제로 심긴 파일을 골라야 한다 — 이름을 리터럴로 적으면
// 그 파일을 안 받는 capability 에서 "기록에 없는 파일" 로 엉뚱하게 통과한다.
const anyLib = (capId) => LIB_MAP[capId][0];

test('a clean package passes preflight on --dry-run', () => {
  // 이 단언이 없으면 아래 세 테스트는 "설치가 원래 안 되는 것"으로도 통과한다.
  const r = install(copyRepo('crew-clean-'));
  assert.strictEqual(r.status, 0, r.stderr);
  assert.match(r.stdout, /DRY RUN/);
});

test('a tampered lib copy is refused at preflight', () => {
  for (const capId of CAP_IDS) {
    const pkg = copyRepo('crew-tampered-');
    fs.appendFileSync(path.join(libDir(pkg, capId), anyLib(capId)), '\n// tampered\n');
    const r = install(pkg);
    assert.notStrictEqual(r.status, 0, `${capId}: a modified bundled lib must not install`);
    assert.match(r.stderr, new RegExp(`${capId}: checks/lib/\\S+ sha256 mismatch`));
  }
});

test('an unrecorded file in checks/lib is refused', () => {
  // 기록에 없는 파일은 설치자가 출처를 말할 수 없다. 사본 옆에 조용히 얹히는
  // 추가 모듈이 가장 위험한 형태다 — require 한 줄이면 실행된다.
  for (const capId of CAP_IDS) {
    const pkg = copyRepo('crew-extra-');
    fs.writeFileSync(path.join(libDir(pkg, capId), 'extra.cjs'), 'module.exports = {};\n');
    const r = install(pkg);
    assert.notStrictEqual(r.status, 0, `${capId}: an unrecorded file must not install`);
    assert.match(r.stderr, new RegExp(`${capId}: checks/lib/extra\\.cjs is not recorded`));
  }
});

test('a missing recorded file is refused', () => {
  for (const capId of CAP_IDS) {
    const pkg = copyRepo('crew-gone-');
    fs.rmSync(path.join(libDir(pkg, capId), anyLib(capId)));
    const r = install(pkg);
    assert.notStrictEqual(r.status, 0, `${capId}: a missing recorded file must not install`);
    assert.match(r.stderr, new RegExp(`${capId}: checks/lib/\\S+ is recorded but missing`));
  }
});

test('an empty LIB-HASH record is refused rather than passing vacuously', () => {
  // 기록이 비고 사본도 없으면 "기록된 것 검사"와 "기록에 없는 것 검사" 두 루프가 모두
  // 공회전한다 — 사본을 전부 지운 패키지가 통과하고, 게이트가 사용자 세션에서 죽는다.
  for (const capId of CAP_IDS) {
    const pkg = copyRepo('crew-emptyrec-');
    const dir = libDir(pkg, capId);
    for (const f of fs.readdirSync(dir)) if (f !== 'LIB-HASH.json') fs.rmSync(path.join(dir, f));
    fs.writeFileSync(path.join(dir, 'LIB-HASH.json'),
      JSON.stringify({ schema: 1, generatedFrom: 'lib/', files: {} }, null, 2) + '\n');
    const r = install(pkg);
    assert.notStrictEqual(r.status, 0, `${capId}: an empty record must not verify`);
    assert.match(r.stderr, new RegExp(`${capId}: LIB-HASH\\.json records no files`));
  }
});

test('a malformed record — bad schema, path key, or hash — is refused', () => {
  const H = 'a'.repeat(64);
  for (const capId of CAP_IDS) {
    const f = anyLib(capId);
    const cases = [
      [{ schema: 2, generatedFrom: 'lib/', files: { [f]: H } }, 'schema-1'],
      [{ schema: 1, generatedFrom: 'lib/', files: { '../../bin/crew.cjs': H } }, 'not a plain file name'],
      [{ schema: 1, generatedFrom: 'lib/', files: { [f]: 'nothex' } }, 'malformed sha256'],
    ];
    for (const [record, needle] of cases) {
      const pkg = copyRepo('crew-badrec-');
      fs.writeFileSync(path.join(libDir(pkg, capId), 'LIB-HASH.json'),
        JSON.stringify(record, null, 2) + '\n');
      const r = install(pkg);
      assert.notStrictEqual(r.status, 0, `${capId} must refuse: ${JSON.stringify(record)}`);
      assert.ok(r.stderr.split('\n').some((l) => l.includes(`${capId}:`) && l.includes(needle)),
        `${capId}: expected "${needle}" reported against ${capId}:\n${r.stderr}`);
    }
  }
});

test('a checks/lib without a readable LIB-HASH.json is refused', () => {
  for (const capId of CAP_IDS) {
    const pkg = copyRepo('crew-norec-');
    fs.writeFileSync(path.join(libDir(pkg, capId), 'LIB-HASH.json'), 'not json\n');
    const r = install(pkg);
    assert.notStrictEqual(r.status, 0, `${capId}: an unreadable record must not install`);
    assert.match(r.stderr,
      new RegExp(`${capId}: checks/lib exists without a readable schema-1`));
  }
});
