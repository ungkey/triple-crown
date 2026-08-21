'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { ROOT } = require('./helpers/repo.cjs');

// D1(스킬명 최대 33자)이 이 개명의 출발점이었다. 길이와 접두사는 사람이 지키는 규칙이
// 아니라 계약이어야 한다. 여기에 프론트매터 일치와 접두사 0 까지 함께 못 박는다.

// installed-surface-resolver.cts:168 SAFE_STEM.
const SAFE_STEM = /^[a-z0-9][a-z0-9-]*$/;
const MAX_STEM = 18;

function capabilityIds() {
  return fs.readdirSync(path.join(ROOT, 'capabilities'), { withFileTypes: true })
    .filter((e) => e.isDirectory()).map((e) => e.name).sort();
}
function stemsOnDisk(id) {
  const dir = path.join(ROOT, 'capabilities', id, 'skills');
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory()).map((e) => e.name).sort();
}
function frontmatterName(id, stem) {
  const src = fs.readFileSync(path.join(ROOT, 'capabilities', id, 'skills', stem, 'SKILL.md'), 'utf8');
  const m = src.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  assert.ok(m, `${id}/${stem}: SKILL.md has no frontmatter block`);
  const n = m[1].match(/^name:[ \t]*(\S+)[ \t]*$/m);
  assert.ok(n, `${id}/${stem}: SKILL.md frontmatter has no name`);
  return n[1];
}

test('every capability id is crew-prefixed and stem-safe', () => {
  const bad = capabilityIds().filter((id) => !id.startsWith('crew-') || !SAFE_STEM.test(id));
  assert.deepStrictEqual(bad, [], 'capability ids off contract');
});

test('every skill stem is crew-prefixed, stem-safe and at most 18 characters', () => {
  // 18자는 확정된 상한이 아니라 D1 이 되돌아오지 못하게 하는 천장이다. 현재 최장은
  // crew-gsd-postship(17자)이고, 개명 전 최장은 33자였다 (구 이름은 docs/RENAME-MAP.md).
  const bad = [];
  for (const id of capabilityIds()) {
    for (const stem of stemsOnDisk(id)) {
      if (!stem.startsWith('crew-')) bad.push(`${id}/${stem}: not crew-prefixed`);
      else if (!SAFE_STEM.test(stem)) bad.push(`${id}/${stem}: fails SAFE_STEM`);
      else if (stem.length > MAX_STEM) bad.push(`${id}/${stem}: ${stem.length} > ${MAX_STEM}`);
    }
  }
  assert.deepStrictEqual(bad, [], 'skill stems off contract');
});

test('the installer surfaces skills verbatim — SKILL_PREFIX is empty', () => {
  // 접두사가 되살아나면 설치된 디렉터리는 다시 `gsd-crew-...` 가 되고, 그때
  // Claude Code 는 프론트매터 name 과 어긋난 디렉터리를 인식하지 못한다.
  const src = fs.readFileSync(path.join(ROOT, 'bin', 'crew.cjs'), 'utf8');
  const m = src.match(/^const SKILL_PREFIX = '([^']*)';/m);
  assert.ok(m, 'SKILL_PREFIX declaration not found in bin/crew.cjs');
  assert.strictEqual(m[1], '', 'SKILL_PREFIX must stay empty now that stems are self-describing');
});

test('each SKILL.md frontmatter name equals its directory stem', () => {
  // SKILL_PREFIX 가 빈 문자열이므로 설치된 디렉터리명 == stem 이다. 프론트매터 name 이
  // 어긋나면 Claude Code 가 스킬을 못 읽는다 (상위 문서 §4 제약 2).
  const bad = [];
  for (const id of capabilityIds()) {
    for (const stem of stemsOnDisk(id)) {
      const name = frontmatterName(id, stem);
      if (name !== stem) bad.push(`${id}/${stem}: frontmatter name=${name}`);
    }
  }
  assert.deepStrictEqual(bad, [], 'frontmatter names diverged from stems');
});

test('every capability manifest lists exactly the stems present on disk', () => {
  const bad = [];
  for (const id of capabilityIds()) {
    const declared = [...(JSON.parse(
      fs.readFileSync(path.join(ROOT, 'capabilities', id, 'capability.json'), 'utf8')).skills || [])].sort();
    const actual = stemsOnDisk(id);
    if (JSON.stringify(declared) !== JSON.stringify(actual)) {
      bad.push(`${id}: declared=${JSON.stringify(declared)} disk=${JSON.stringify(actual)}`);
    }
  }
  assert.deepStrictEqual(bad, [], 'manifest skills lists diverged from disk');
});
