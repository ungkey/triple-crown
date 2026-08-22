#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

function readJson(p) {
  if (!fs.existsSync(p)) return {};
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}
function ensureArray(obj, key) {
  if (!Array.isArray(obj[key])) obj[key] = [];
  return obj[key];
}
// This script runs as a standalone child process of the installer, so it does not
// require legacy-backup.cjs. Instead it collects the filenames it must recognise
// here in one place. Same value as legacy-backup.cjs's SHIP_GUARD; if the two ever
// drift, the "agree on the old filename" test in e2e/contract/legacy-transition.test.cjs
// catches it.
const GUARD_FILENAMES = ['crew-ship-guard.cjs', 'triple-crown-ship-guard.cjs'];
function isGuardHook(h) {
  if (!h || h.type !== 'command') return false;
  const cmd = String(h.command || '');
  return GUARD_FILENAMES.some((name) => cmd.includes(name));
}
function sameHookGroup(group, command) {
  if (!group || group.matcher !== 'Bash' || !Array.isArray(group.hooks)) return false;
  return group.hooks.some(h => h && h.type === 'command' && h.command === command);
}
// Rewrite pre-0.6.4 registrations that executed the guard file directly. The copied
// file has no executable bit on npm-installed trees and shebangs are ignored on
// Windows, so the hook silently failed with a permission error.
function migrateLegacyRegistrations(groups, command) {
  for (const group of groups) {
    if (!group || !Array.isArray(group.hooks)) continue;
    for (const h of group.hooks) {
      if (isGuardHook(h) && h.command !== command) h.command = command;
    }
  }
}

try {
  const projectRoot = path.resolve(process.argv[2] || process.cwd());
  const source = path.resolve(__dirname, '..', 'guards', 'crew-ship-guard.cjs');
  if (!fs.existsSync(source)) throw new Error(`guard source missing: ${source}`);

  const claudeDir = path.join(projectRoot, '.claude');
  const hooksDir = path.join(claudeDir, 'hooks');
  fs.mkdirSync(hooksDir, { recursive: true });

  const target = path.join(hooksDir, 'crew-ship-guard.cjs');
  fs.copyFileSync(source, target);
  // npm/npx trees do not preserve an executable bit that the git checkout never had.
  fs.chmodSync(target, 0o755);

  const settingsPath = path.join(claudeDir, 'settings.json');
  const settings = readJson(settingsPath);
  if (!settings.hooks || typeof settings.hooks !== 'object') settings.hooks = {};
  const pre = ensureArray(settings.hooks, 'PreToolUse');
  // Invoke through an explicit interpreter: this is the only form that works on
  // Windows and on a tree where the executable bit was stripped.
  const command = 'node "$CLAUDE_PROJECT_DIR/.claude/hooks/crew-ship-guard.cjs"';

  migrateLegacyRegistrations(pre, command);

  // Migration only swaps the old registration's command for the new one. If the new
  // registration already existed, there are now two identical groups, and the push
  // check below only decides whether to add a group — it does not remove either one.
  const matching = pre.filter(g => sameHookGroup(g, command));
  if (matching.length > 1) {
    settings.hooks.PreToolUse = pre.filter(g => !sameHookGroup(g, command) || g === matching[0]);
  }

  if (!settings.hooks.PreToolUse.some(group => sameHookGroup(group, command))) {
    settings.hooks.PreToolUse.push({
      matcher: 'Bash',
      hooks: [
        {
          type: 'command',
          command
        }
      ]
    });
  }

  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n');
  console.log(`Installed Crew ship guard: ${target}`);
  console.log(`Updated Claude Code project settings: ${settingsPath}`);
} catch (err) {
  console.error(`install-claude-ship-guard: ${err.message}`);
  process.exit(1);
}
