'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const { ROOT, tempDir } = require('./helpers/repo.cjs');

// 개명 전 설치본이 남은 머신에서 무슨 일이 일어나는가.
//
// 이 파일은 **characterization 테스트**다 — 지금 동작을 기록한다. M1a 는 순수
// 리팩터링이라 제거 로직을 넣지 않았다(설계 §7.5). M1c 가 `crew uninstall-legacy`
// 로 제거를 추가했다 — 이 파일의 1·3·5 번은 그 결과를 반영하도록 재타깃됐다.
// (2 번·4 번은 아직 M1c 이전 동작을 기록한다 — 4 번은 Task 4 소관.)
//
//   설치자 상수          구 설치본이 남긴 것            결과 (M1c 이후)
//   ------------------   ---------------------------   ------------------------
//   CAPABILITIES         triple-gstack 등 구 id         `crew uninstall` 대상 밖
//                                                        (`crew uninstall-legacy` 가 원장에서 제거)
//   SKILL_MARKER         .triple-crown-skill            `crew uninstall` 이 건너뜀
//                                                        (`crew uninstall-legacy` 가 planRemoval.skills 로 찾아 지움)
//   ship guard 파일명    triple-crown-ship-guard.cjs    설치자(bin/crew.cjs) 는 그 이름을
//                                                        모른다 — scripts/legacy-backup.cjs 의
//                                                        SHIP_GUARD 를 통해서만 다룬다
//
// 두 명령의 소유 범위는 겹치지 않는다: `crew uninstall` 은 현행 crew 브랜드만 보고,
// `crew uninstall-legacy` 는 개명 전 설치본만 본다. 목록은 docs/RENAME-MAP.md 참조.

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

test('uninstall leaves pre-M1a skills alone; uninstall-legacy is what removes them', () => {
  const proj = tempDir('crew-legacy-transition-');
  mkSkill(proj, 'gsd-triple-gstack-code-review', OLD_MARKER);
  mkSkill(proj, 'crew-gsd-review', NEW_MARKER);
  mkSkill(proj, 'unmanaged-skill', '.some-other-marker');

  // 두 명령의 소유 범위는 겹치지 않는다. uninstall 은 현행 브랜드만 본다.
  const r = cp.spawnSync(process.execPath, [CLI, 'uninstall', '--yes', '--project', proj], {
    encoding: 'utf8', timeout: 60000,
  });
  assert.strictEqual(r.status, 0, `uninstall failed: ${r.stderr || r.stdout}`);
  assert.deepStrictEqual(fs.readdirSync(path.join(proj, '.claude', 'skills')).sort(),
    ['gsd-triple-gstack-code-review', 'unmanaged-skill']);

  // uninstall-legacy 가 구 마커를 가져간다. 남의 마커는 그대로 둔다.
  const { planRemoval } = require(path.join(ROOT, 'scripts', 'uninstall-legacy.cjs'));
  assert.deepStrictEqual(planRemoval(proj).skills,
    ['.claude/skills/gsd-triple-gstack-code-review']);
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

test('the legacy ship guard filename lives in the legacy module, not in the installer', () => {
  const src = fs.readFileSync(CLI, 'utf8');
  assert.ok(src.includes('crew-ship-guard.cjs'), 'renamed ship guard filename not found');
  assert.ok(!src.includes('triple-crown-ship-guard.cjs'),
    'the installer must reach the old name through scripts/legacy-backup.cjs, never by copying the literal');
  const legacy = require(path.join(ROOT, 'scripts', 'legacy-backup.cjs'));
  assert.strictEqual(legacy.SHIP_GUARD, 'triple-crown-ship-guard.cjs');
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

test('the installer stays single-marker; dual-marker knowledge lives in the legacy module', () => {
  const src = fs.readFileSync(CLI, 'utf8');
  const m = src.match(/^const SKILL_MARKER = '([^']*)';/m);
  assert.ok(m, 'SKILL_MARKER declaration not found in bin/crew.cjs');
  assert.strictEqual(m[1], NEW_MARKER);
  assert.ok(!src.includes(OLD_MARKER),
    'the old marker literal must not be copied into the installer');
  const legacy = require(path.join(ROOT, 'scripts', 'legacy-backup.cjs'));
  assert.deepStrictEqual(legacy.LEGACY_SKILL_MARKERS, [OLD_MARKER]);
  assert.ok(legacy.SKILL_MARKERS.includes(NEW_MARKER),
    'backup still captures both markers — removal is what narrows to the old one');
});
