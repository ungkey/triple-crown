'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const { ROOT, tempDir } = require('./helpers/repo.cjs');

// 개명 전 설치본이 남은 머신에서 무슨 일이 일어나는가.
//
// 이 파일은 **characterization 테스트**다 — 고쳐야 할 동작이 아니라 지금 동작을
// 기록한다. M1a 는 순수 리팩터링이라 제거 로직을 넣지 않는다(설계 §7.5). 그래서
// 개명 전 설치본은 그대로 남고, 새 설치본이 그 옆에 추가된다.
//
//   설치자 상수          구 설치본이 남긴 것            결과
//   ------------------   ---------------------------   ------------------------
//   CAPABILITIES         triple-gstack 등 구 id         capability remove 대상 밖
//   SKILL_MARKER         .triple-crown-skill            uninstall 스캔이 건너뜀
//   ship guard 파일명    triple-crown-ship-guard.cjs    removeShipGuard 대상 밖
//
// **M1c `crew uninstall-legacy` 가 이 단언들을 뒤집는다.** 그때 아래 테스트는
// "구 표면도 제거된다"로 바뀌어야 하며, 그 수정이 M1c 가 실제로 동작한다는 증거다.
// 현재 노출은 0 이다: 이 머신 `legacy targets: 0`, npm 레지스트리 404, 원격
// 부트스트랩 파손, 설치 시점 프리릴리스 펜스. 목록은 docs/RENAME-MAP.md 참조.

const CLI = path.join(ROOT, 'bin', 'crew.cjs');
const OLD_MARKER = '.triple-crown-skill';
const NEW_MARKER = '.crew-skill';

function mkSkill(root, name, marker) {
  const dir = path.join(root, '.claude', 'skills', name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'SKILL.md'), `---\nname: ${name}\n---\n`);
  fs.writeFileSync(path.join(dir, marker), '');
  return dir;
}

test('uninstall removes crew-marked skills and leaves pre-M1a marked ones behind', () => {
  const proj = tempDir('crew-legacy-transition-');
  mkSkill(proj, 'gsd-triple-gstack-code-review', OLD_MARKER);
  mkSkill(proj, 'crew-gsd-review', NEW_MARKER);
  mkSkill(proj, 'unmanaged-skill', '.some-other-marker');

  const r = cp.spawnSync(process.execPath, [CLI, 'uninstall', '--yes', '--project', proj], {
    encoding: 'utf8', timeout: 60000,
  });
  assert.strictEqual(r.status, 0, `uninstall failed: ${r.stderr || r.stdout}`);

  const left = fs.readdirSync(path.join(proj, '.claude', 'skills')).sort();
  // M1c 가 이 목록에서 gsd-triple-gstack-code-review 를 빼야 한다.
  assert.deepStrictEqual(left, ['gsd-triple-gstack-code-review', 'unmanaged-skill'],
    'pre-M1a marked skills are still orphaned by uninstall (M1c owns their removal)');
});

test('the installer capability list carries no pre-M1a id, so old ledger rows are never removed', () => {
  // installCapabilities() 는 CAPABILITIES 를 돌며 capability remove 를 부른다.
  // 목록에 구 id 가 없으면 구 원장 항목은 손대지 않는다.
  const src = fs.readFileSync(CLI, 'utf8');
  const m = src.match(/^const CAPABILITIES = (\[[^\]]*\]);$/m);
  assert.ok(m, 'CAPABILITIES declaration not found in bin/crew.cjs');
  const ids = JSON.parse(m[1].replace(/'/g, '"'));
  assert.deepStrictEqual(ids.filter((id) => /^triple-/.test(id)), [],
    'pre-M1a capability ids must not reappear here — M1c removes them, M1a does not');
  assert.ok(ids.every((id) => id.startsWith('crew-')), `unexpected capability ids: ${ids}`);
});

test('the ship guard the installer removes is the renamed one only', () => {
  const src = fs.readFileSync(CLI, 'utf8');
  assert.ok(src.includes('crew-ship-guard.cjs'), 'renamed ship guard filename not found');
  assert.ok(!src.includes('triple-crown-ship-guard.cjs'),
    'pre-M1a ship guard filename must not linger in the installer — M1c removes that hook');
});

test('the skill ownership marker is the renamed one only', () => {
  const src = fs.readFileSync(CLI, 'utf8');
  const m = src.match(/^const SKILL_MARKER = '([^']*)';$/m);
  assert.ok(m, 'SKILL_MARKER declaration not found in bin/crew.cjs');
  assert.strictEqual(m[1], NEW_MARKER);
  // 양쪽 마커를 보게 만드는 것은 동작 변경이므로 M1a 범위 밖이다.
  // scripts/legacy-backup.cjs 가 그 관용구(SKILL_MARKERS 배열)를 이미 갖고 있다.
  assert.ok(!src.includes(OLD_MARKER),
    'M1a keeps the installer single-marker; dual-marker handling belongs to M1c');
});
