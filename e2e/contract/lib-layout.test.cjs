'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { ROOT, walkFiles } = require('./helpers/repo.cjs');

const SHARED = ['repo-state-lib.cjs', 'evidence-store.cjs', 'resolve-phase-dir.cjs'];

test('the shared libs live in lib/ and nowhere else as an original', () => {
  for (const f of SHARED) {
    assert.ok(fs.existsSync(path.join(ROOT, 'lib', f)), `lib/${f} must be the canonical copy`);
    // 이동 전 위치에 남아 있으면 두 원본이 공존한다 — 정확히 이 상태가 §4 가 없애려는 것이다.
    assert.ok(!fs.existsSync(path.join(ROOT, 'capabilities', 'triple-gstack', 'checks', f)),
      `capabilities/triple-gstack/checks/${f} must have moved into lib/`);
  }
});

test('every bundled copy is byte-identical to its canonical lib', () => {
  const dir = path.join(ROOT, 'capabilities', 'triple-gstack', 'checks', 'lib');
  for (const f of SHARED) {
    assert.deepStrictEqual(
      fs.readFileSync(path.join(dir, f)),
      fs.readFileSync(path.join(ROOT, 'lib', f)),
      `checks/lib/${f} drifted from lib/${f}`);
  }
});

test('every relative require inside capabilities/ resolves to a file that exists', () => {
  // require 경로를 손으로 12파일에서 고치는 작업이라 한 곳만 놓쳐도 런타임에만 터진다.
  // 정적으로 전수 확인한다.
  const bad = [];
  for (const f of walkFiles(path.join(ROOT, 'capabilities'), ['.cjs'])) {
    const dir = path.dirname(f);
    for (const m of fs.readFileSync(f, 'utf8').matchAll(/require\(\s*['"](\.[^'"]+)['"]\s*\)/g)) {
      if (!fs.existsSync(path.resolve(dir, m[1]))) {
        bad.push(`${path.relative(ROOT, f)}: require('${m[1]}')`);
      }
    }
  }
  assert.deepStrictEqual(bad, [], 'unresolvable relative requires');
});

test('every checks/ path a SKILL.md invokes exists in that capability', () => {
  // SKILL.md 는 실행되는 문서다. 여기 적힌 경로가 틀리면 스킬이 런타임에 죽는데
  // 어떤 단위 테스트도 마크다운을 실행하지 않는다.
  const bad = [];
  for (const f of walkFiles(path.join(ROOT, 'capabilities'), ['SKILL.md'])) {
    // capabilities/<id>/skills/<stem>/SKILL.md → capability 루트는 세 단계 위
    const capDir = path.join(path.dirname(f), '..', '..');
    for (const m of fs.readFileSync(f, 'utf8').matchAll(/(checks\/[A-Za-z0-9._/-]+\.cjs)/g)) {
      if (!fs.existsSync(path.join(capDir, m[1]))) {
        bad.push(`${path.relative(ROOT, f)}: ${m[1]}`);
      }
    }
  }
  assert.deepStrictEqual(bad, [], 'SKILL.md points at missing check scripts');
});
