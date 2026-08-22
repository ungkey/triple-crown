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

test('a pre-M1a ship guard registration is migrated in place — one hook group, not two', () => {
  // M1a 시점에는 isGuardHook() 이 'crew-ship-guard.cjs' 만 찾아 구 등록을 못 알아봤고,
  // 그래서 새 그룹이 따로 붙어 Bash 호출마다 두 가드가 돌았다. M1c 가 구 파일명을
  // 같은 술어에 합류시켜 in-place 치환으로 되돌린다.
  const proj = tempDir('crew-legacy-transition-');
  const claudeDir = path.join(proj, '.claude');
  fs.mkdirSync(claudeDir, { recursive: true });
  const legacyCommand = 'node "$CLAUDE_PROJECT_DIR/.claude/hooks/triple-crown-ship-guard.cjs"';
  fs.writeFileSync(path.join(claudeDir, 'settings.json'), JSON.stringify({
    hooks: {
      PreToolUse: [
        { matcher: 'Bash', hooks: [{ type: 'command', command: legacyCommand }] },
        { matcher: 'Bash', hooks: [{ type: 'command', command: 'node /home/u/unrelated.cjs' }] },
      ],
    },
  }, null, 2));

  const guardScript = path.join(ROOT, 'scripts', 'install-claude-ship-guard.cjs');
  const r = cp.spawnSync(process.execPath, [guardScript, proj], { encoding: 'utf8', timeout: 30000 });
  assert.strictEqual(r.status, 0, `guard install failed: ${r.stderr || r.stdout}`);

  const settings = JSON.parse(fs.readFileSync(path.join(claudeDir, 'settings.json'), 'utf8'));
  const commands = settings.hooks.PreToolUse.map((g) => g.hooks[0].command);
  assert.strictEqual(commands.filter((c) => c.includes('ship-guard')).length, 1,
    'exactly one ship guard registration must remain');
  assert.ok(commands.some((c) => c.includes('crew-ship-guard.cjs')), 'it must be the renamed one');
  assert.ok(!commands.some((c) => c.includes('triple-crown-ship-guard.cjs')), 'the old command must be gone');
  assert.ok(commands.includes('node /home/u/unrelated.cjs'), "someone else's Bash hook must survive");
});

test('the guard installer and the legacy module agree on the old filename', () => {
  const src = fs.readFileSync(path.join(ROOT, 'scripts', 'install-claude-ship-guard.cjs'), 'utf8');
  const legacy = require(path.join(ROOT, 'scripts', 'legacy-backup.cjs'));
  assert.ok(src.includes(legacy.SHIP_GUARD),
    `install-claude-ship-guard.cjs must recognise ${legacy.SHIP_GUARD}`);
});

test('a tree carrying both the legacy and the current registration collapses to one group', () => {
  const proj = tempDir('crew-legacy-transition-');
  const claudeDir = path.join(proj, '.claude');
  fs.mkdirSync(claudeDir, { recursive: true });
  const command = 'node "$CLAUDE_PROJECT_DIR/.claude/hooks/crew-ship-guard.cjs"';
  fs.writeFileSync(path.join(claudeDir, 'settings.json'), JSON.stringify({
    hooks: { PreToolUse: [
      { matcher: 'Bash', hooks: [{ type: 'command',
        command: 'node "$CLAUDE_PROJECT_DIR/.claude/hooks/triple-crown-ship-guard.cjs"' }] },
      { matcher: 'Bash', hooks: [{ type: 'command', command }] },
      { matcher: 'Bash', hooks: [{ type: 'command', command: 'node /home/u/unrelated.cjs' }] },
    ] },
  }, null, 2));

  const guardScript = path.join(ROOT, 'scripts', 'install-claude-ship-guard.cjs');
  const r = cp.spawnSync(process.execPath, [guardScript, proj], { encoding: 'utf8', timeout: 30000 });
  assert.strictEqual(r.status, 0, r.stderr || r.stdout);

  const settings = JSON.parse(fs.readFileSync(path.join(claudeDir, 'settings.json'), 'utf8'));
  const commands = settings.hooks.PreToolUse.flatMap((g) => g.hooks.map((h) => h.command));
  assert.strictEqual(commands.filter((c) => c.includes('ship-guard')).length, 1,
    'the guard must fire exactly once per Bash call');
  assert.ok(commands.includes('node /home/u/unrelated.cjs'), 'unrelated hooks survive');
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
