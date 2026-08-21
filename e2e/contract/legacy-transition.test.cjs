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
  const m = src.match(/^const CAPABILITIES = (\[[^\]]*\]);/m);
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

test('a pre-M1a ship guard registration is not migrated — two hook groups fire on every Bash call', () => {
  // 오늘의 동작을 그대로 기록한다: scripts/install-claude-ship-guard.cjs 의
  // isGuardHook() 은 'crew-ship-guard.cjs' 부분 문자열만 찾는다.
  // 'triple-crown-ship-guard.cjs' 는 'crown-ship-guard.cjs' 를 담을 뿐 그 부분
  // 문자열을 포함하지 않으므로(-crown- vs -crew-) migrateLegacyRegistrations() 가
  // 옛 등록을 못 알아보고 그대로 둔다. sameHookGroup() 도 새 command 문자열과
  // 정확히 일치하는 그룹만 찾으므로 새 그룹이 별도로 추가된다 — 결과는 PreToolUse
  // 그룹 2개, Bash 호출마다 옛/새 가드가 모두 실행된다.
  // **M1c 가 이 단언을 뒤집는다.** isGuardHook() 이 옛 파일명도 인식하게 만들면
  // 이 테스트는 "그룹은 하나로 합쳐진다"로 바뀌어야 하며, 그 수정이 M1c 가 실제로
  // 동작한다는 증거다.
  const proj = tempDir('crew-legacy-transition-');
  const claudeDir = path.join(proj, '.claude');
  fs.mkdirSync(claudeDir, { recursive: true });
  const legacyCommand = 'node "$CLAUDE_PROJECT_DIR/.claude/hooks/triple-crown-ship-guard.cjs"';
  fs.writeFileSync(path.join(claudeDir, 'settings.json'), JSON.stringify({
    hooks: {
      PreToolUse: [
        { matcher: 'Bash', hooks: [{ type: 'command', command: legacyCommand }] },
      ],
    },
  }, null, 2));

  // 설치기의 가드 설치 단계 그 자체를 돌린다 — bin/crew.cjs:462-464의
  // installShipGuard() 가 부르는 것과 똑같은 스크립트, 똑같은 호출 형태다.
  // 전체 `crew install` 은 GSD/gstack 탐지와 prerelease 동의를 요구해 이 가드
  // 전용 동작에는 느리고 결정적이지 않으므로 쓰지 않는다.
  const guardScript = path.join(ROOT, 'scripts', 'install-claude-ship-guard.cjs');
  const r = cp.spawnSync(process.execPath, [guardScript, proj], { encoding: 'utf8', timeout: 30000 });
  assert.strictEqual(r.status, 0, `guard install failed: ${r.stderr || r.stdout}`);

  const settings = JSON.parse(fs.readFileSync(path.join(claudeDir, 'settings.json'), 'utf8'));
  assert.strictEqual(settings.hooks.PreToolUse.length, 2,
    'pre-M1a ship guard registration is left in place alongside the new one (M1c owns migrating/deduping it)');
});

test('the skill ownership marker is the renamed one only', () => {
  const src = fs.readFileSync(CLI, 'utf8');
  const m = src.match(/^const SKILL_MARKER = '([^']*)';/m);
  assert.ok(m, 'SKILL_MARKER declaration not found in bin/crew.cjs');
  assert.strictEqual(m[1], NEW_MARKER);
  // 양쪽 마커를 보게 만드는 것은 동작 변경이므로 M1a 범위 밖이다.
  // scripts/legacy-backup.cjs 가 그 관용구(SKILL_MARKERS 배열)를 이미 갖고 있다.
  assert.ok(!src.includes(OLD_MARKER),
    'M1a keeps the installer single-marker; dual-marker handling belongs to M1c');
});
