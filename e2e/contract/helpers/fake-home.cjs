'use strict';

const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const { tempDir } = require('./repo.cjs');

const ROUTING_BLOCK = [
  '<!-- triple-crown:managed-routing:start -->',
  '## Triple Crown routing (legacy fixture)',
  'routing body line',
  '<!-- triple-crown:managed-routing:end -->',
].join('\n') + '\n';

const HOOK_GROUP = {
  matcher: 'Bash',
  hooks: [{
    type: 'command',
    command: '"$CLAUDE_PROJECT_DIR"/.claude/hooks/triple-crown-ship-guard.cjs',
  }],
};

const CAPABILITIES = ['triple-gstack', 'triple-superpowers', 'triple-crown-guide'];

function mkFakeHome() {
  const home = tempDir('crew-fake-home-');
  const w = (rel, content) => {
    const p = path.join(home, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, content);
  };
  for (const id of CAPABILITIES) {
    w(`.gsd/capabilities/${id}/capability.json`, JSON.stringify({ id }) + '\n');
  }
  w('.triple-crown/VERSION', '0.6.3\n');
  w('.triple-crown/INSTALL-MANIFEST.json', '{}\n');
  w('.claude/hooks/triple-crown-ship-guard.cjs', '#!/usr/bin/env node\nprocess.exit(0);\n');
  w('CLAUDE.md', ROUTING_BLOCK + '\n# user content\nuser line kept\n');
  w('.claude/settings.json',
    JSON.stringify({ hooks: { PreToolUse: [HOOK_GROUP] }, userSetting: true }, null, 2) + '\n');
  w('.claude/skills/gsd-triple-crown/SKILL.md', '---\nname: gsd-triple-crown\n---\n');
  w('.claude/skills/gsd-triple-crown/.triple-crown-skill', '');
  return home;
}

// HOME 만 넘긴 호출은 Windows 에서 픽스처가 아니라 **진짜 홈**을 대상으로 삼는다 —
// os.homedir() 는 거기서 USERPROFILE 을 본다. 그 홈에 개명 전 설치본이 남아 있으면
// legacy-backup.test.cjs 의 진짜 non-dry-run restore 가 그것을 덮어쓴다(assertRestoreHome
// 은 양쪽이 같은 실제 홈으로 풀리므로 통과한다). 호출부 35곳을 고치는 대신 여기서 미러링한다.
// env 를 뒤에 펴므로 USERPROFILE 을 명시한 호출은 그쪽이 이긴다.
function runBackupTool(args, env) {
  const script = path.join(__dirname, '..', '..', '..', 'scripts', 'legacy-backup.cjs');
  return cp.spawnSync(process.execPath, [script, ...args], {
    encoding: 'utf8',
    env: { ...process.env, ...(env && env.HOME ? { USERPROFILE: env.HOME } : {}), ...env },
  });
}

module.exports = { mkFakeHome, runBackupTool, ROUTING_BLOCK, HOOK_GROUP, CAPABILITIES };
