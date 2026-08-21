'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const { ROOT } = require('./helpers/repo.cjs');

// M1a 개명이 되돌아오지 못하게 막는 펜스. 문자열 하나가 새로 들어오는 것은
// 리뷰에서 눈으로 못 잡는다 — 표면 전체를 정적으로 훑는다.

const LEGACY = /triple-crown|triple_crown|triple-gstack|triple-superpowers|TRIPLE_|Triple\s+Crown|TC_GSTACK|TC_GUIDE/;

// 구 이름이 **남아 있어야 하는** 파일. 두 부류뿐이다.
//   (1) 레거시 탐지/복구: 개명 전 설치본을 가리켜야 동작한다.
//   (2) 설계/계획/이력 기록: 매핑이나 지난 릴리스의 표면을 기록하므로 구 이름이 사료다.
const ALLOW = [
  'scripts/legacy-backup.cjs',
  'e2e/contract/legacy-backup.test.cjs',
  'e2e/contract/helpers/fake-home.cjs',
  'e2e/contract/legacy-transition.test.cjs',
  'e2e/compatibility-baseline.json',
  'e2e/contract/brand-names.test.cjs',
  'docs/RENAME-MAP.md',
  'docs/RESTRUCTURE-PLAN.md',
  'docs/V0.7-IMPLEMENTATION-DESIGN.md',
];
const ALLOW_PREFIX = ['docs/superpowers/'];
// 이 두 정규식은 개명 스크립트의 FROZEN 항목과 **글자 그대로 같아야 한다**.
const ALLOW_RE = [/^docs\/V0\.[0-6][^/]*\.md$/, /^tests\/[^/]*\.md$/];

// 부트스트랩이 가리키는 GitHub 경로. 저장소 개명은 외부 작업이라 M1a 범위 밖이고,
// install.sh 는 아직 구 이름 아래의 마지막 안정 태그를 받는다. **이 토큰만** 예외다.
const REPO_PATH = 'ungkey/triple-crown';
// 파일별 정확한 등장 횟수. 마스킹이 줄 단위 통짜 제거라 이 토큰에 이어 붙는 것
// (`ungkey/triple-crown-guide` 같은)은 LEGACY 검사를 빠져나간다. 횟수를 못 박으면
// 새로 끼어드는 모든 등장이 잡힌다. Task 4 B(저장소 개명) 승인 시 이 표와 아래
// 두 테스트가 통째로 사라진다.
const REPO_PATH_COUNTS = {
  'install.sh': 3,
  'install.ps1': 1,
  'package.json': 1,
  'README.md': 11,
  'docs/INSTALLER.md': 6,
};

function tracked() {
  return cp.execSync('git ls-files -z', { cwd: ROOT, encoding: 'buffer' })
    .toString('utf8').split('\0').filter(Boolean);
}
function allowed(rel) {
  return ALLOW.includes(rel)
    || ALLOW_PREFIX.some((p) => rel.startsWith(p))
    || ALLOW_RE.some((re) => re.test(rel));
}
function textOf(rel) {
  let buf;
  try { buf = fs.readFileSync(path.join(ROOT, rel)); } catch { return null; }
  if (buf.includes(0)) return null;
  return buf.toString('utf8');
}

test('no tracked file outside the allowlist still carries a pre-M1a brand token', () => {
  const bad = [];
  for (const rel of tracked()) {
    if (allowed(rel)) continue;
    const src = textOf(rel);
    if (src === null) continue;
    src.split('\n').forEach((line, i) => {
      const stripped = line.split(REPO_PATH).join('');
      if (LEGACY.test(stripped)) bad.push(`${rel}:${i + 1}: ${line.trim().slice(0, 90)}`);
    });
  }
  assert.deepStrictEqual(bad, [], 'pre-M1a brand tokens leaked back in');
});

test('no tracked path still carries a pre-M1a brand token', () => {
  const bad = tracked().filter((rel) => LEGACY.test(rel));
  assert.deepStrictEqual(bad, [], 'pre-M1a brand tokens in file paths');
});

test('the allowlist is alive — every entry exists and still holds a legacy name', () => {
  // 허용 목록이 조용히 죽는 것이 이 펜스의 가장 흔한 실패 방식이다. 파일이 지워지거나
  // 개명되면 목록은 그대로 통과하고, 그 뒤에 들어오는 진짜 회귀를 못 잡게 된다.
  const dead = [];
  for (const rel of ALLOW) {
    if (rel === 'e2e/contract/brand-names.test.cjs') continue; // 자기 자신
    const abs = path.join(ROOT, rel);
    if (!fs.existsSync(abs)) { dead.push(`${rel}: missing`); continue; }
    if (!LEGACY.test(fs.readFileSync(abs, 'utf8'))) dead.push(`${rel}: no legacy name left — drop it from ALLOW`);
  }
  assert.deepStrictEqual(dead, [], 'stale allowlist entries');
});

test('the old GitHub path appears only where the bootstrap actually needs it', () => {
  const bad = [];
  for (const rel of tracked()) {
    if (Object.hasOwn(REPO_PATH_COUNTS, rel) || allowed(rel)) continue;
    const src = textOf(rel);
    if (src === null) continue;
    if (src.includes(REPO_PATH)) bad.push(rel);
  }
  assert.deepStrictEqual(bad, [], `${REPO_PATH} outside the bootstrap surface`);
});

test('the old GitHub path appears exactly as many times as the bootstrap needs', () => {
  const drift = [];
  for (const [rel, want] of Object.entries(REPO_PATH_COUNTS)) {
    const src = textOf(rel);
    if (src === null) { drift.push(`${rel}: unreadable`); continue; }
    const got = src.split(REPO_PATH).length - 1;
    if (got !== want) drift.push(`${rel}: ${got} occurrences, expected ${want}`);
  }
  assert.deepStrictEqual(drift, [], 'bootstrap repo-path occurrences drifted');
});
