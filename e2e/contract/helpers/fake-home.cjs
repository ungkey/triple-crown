'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');

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
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'crew-fake-home-'));
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

function runBackupTool(args, env) {
  const script = path.join(__dirname, '..', '..', '..', 'scripts', 'legacy-backup.cjs');
  return cp.spawnSync(process.execPath, [script, ...args], {
    encoding: 'utf8',
    env: { ...process.env, ...env },
  });
}

module.exports = { mkFakeHome, runBackupTool, ROUTING_BLOCK, HOOK_GROUP, CAPABILITIES };
