#!/usr/bin/env node
'use strict';

/*
 * Claude Code PreToolUse(Bash) hook.
 *
 * Protects remote ship effects in a GSD-controlled project. It does not attempt
 * to identify "gstack" by prompt text. Instead it blocks the effects that make
 * an alternate ship workflow dangerous: push / PR create / PR merge.
 *
 * GSD ship:pre arms a short-lived authorization. The first protected command
 * binds that authorization to the current Claude session id.
 */

const fs = require('fs');
const path = require('path');
const cp = require('child_process');

function deny(reason) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: reason
    }
  }) + '\n');
  process.exit(0);
}
function allow(reason) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'allow',
      permissionDecisionReason: reason
    }
  }) + '\n');
  process.exit(0);
}

function gitRoot(cwd) {
  try {
    return cp.execFileSync('git', ['rev-parse', '--show-toplevel'], {
      cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore']
    }).trim();
  } catch {
    return null;
  }
}
function readJson(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; }
}
function writeJson(p, obj) {
  fs.writeFileSync(p, JSON.stringify(obj, null, 2) + '\n');
}
function expired(auth) {
  const t = Date.parse(auth && auth.expiresAt || '');
  return !Number.isFinite(t) || Date.now() > t;
}
function classify(command) {
  const c = String(command || '');
  const actions = [];
  if (/(^|[;&|]\s*|\s)git\s+push(?:\s|$)/m.test(c)) actions.push('gitPush');
  if (/(^|[;&|]\s*|\s)gh\s+pr\s+create(?:\s|$)/m.test(c)) actions.push('prCreate');
  if (/(^|[;&|]\s*|\s)gh\s+pr\s+merge(?:\s|$)/m.test(c)) actions.push('prMerge');
  if (/(^|[;&|]\s*|\s)glab\s+mr\s+create(?:\s|$)/m.test(c)) actions.push('prCreate');
  if (/(^|[;&|]\s*|\s)glab\s+mr\s+merge(?:\s|$)/m.test(c)) actions.push('prMerge');
  return [...new Set(actions)];
}
function listDiffFiles(root, baseHead) {
  try {
    return cp.execFileSync('git', ['diff', '--name-only', `${baseHead}..HEAD`], {
      cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore']
    }).split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  } catch {
    return null;
  }
}
function pathAllowed(rel, patterns) {
  const p = rel.replace(/\\/g, '/');
  for (const pat of patterns || []) {
    if (pat.endsWith('/**') && p.startsWith(pat.slice(0, -2))) return true;
    if (pat.endsWith('.*')) {
      const prefix = pat.slice(0, -1);
      if (p.startsWith(prefix)) return true;
    }
    if (p === pat) return true;
  }
  return false;
}
function bindAndConsume(authPath, auth, sessionId, action) {
  if (auth.boundSessionId && auth.boundSessionId !== sessionId) {
    return { ok: false, reason: `authorization belongs to another Claude session (${auth.boundSessionId})` };
  }
  if (!auth.boundSessionId) auth.boundSessionId = sessionId;
  const limit = auth.limits && auth.limits[action];
  const used = auth.actionCounts && auth.actionCounts[action] || 0;
  if (!Number.isFinite(limit) || used >= limit) {
    return { ok: false, reason: `${action} authorization exhausted (${used}/${limit ?? 0})` };
  }
  auth.actionCounts[action] = used + 1;
  writeJson(authPath, auth);
  return { ok: true };
}

let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', c => input += c);
process.stdin.on('end', () => {
  let evt;
  try { evt = JSON.parse(input || '{}'); } catch { process.exit(0); }
  if (evt.tool_name !== 'Bash') process.exit(0);

  const actions = classify(evt.tool_input && evt.tool_input.command);
  if (!actions.length) process.exit(0);

  const root = gitRoot(evt.cwd || process.cwd());
  if (!root) process.exit(0);
  if (!fs.existsSync(path.join(root, '.planning', 'STATE.md'))) process.exit(0);

  const tc = path.join(root, '.planning', '.triple-crown');
  const shipPath = path.join(tc, 'ship-auth.json');
  const docsPath = path.join(tc, 'docs-push-auth.json');
  const ship = readJson(shipPath);
  const docs = readJson(docsPath);
  const sessionId = evt.session_id || '(unknown-session)';

  // PR merge is never part of GSD ship v0.5. It requires an explicit future merge authorization.
  if (actions.includes('prMerge')) {
    deny('Triple Crown: PR/MR merge is not authorized by the GSD ship owner. Merge remains an explicit external action.');
  }

  // Main GSD ship authorization can cover push + a single PR creation.
  if (ship && ship.kind === 'gsd-ship' && !expired(ship)) {
    if (ship.branch) {
      let branch = '';
      try {
        branch = cp.execFileSync('git', ['branch', '--show-current'], {
          cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore']
        }).trim();
      } catch {}
      if (branch !== ship.branch) {
        deny(`Triple Crown: armed GSD ship branch is ${ship.branch}, current branch is ${branch || '(detached)'}.`);
      }
    }
    for (const action of actions) {
      const r = bindAndConsume(shipPath, ship, sessionId, action);
      if (!r.ok) deny(`Triple Crown ship guard: ${r.reason}`);
    }
    allow('Triple Crown: protected remote effect authorized by active GSD ship.');
  }

  // document-release receives only a narrow docs-only git-push authorization.
  if (actions.length === 1 && actions[0] === 'gitPush' &&
      docs && docs.kind === 'gstack-document-release' && !expired(docs)) {
    if (docs.boundSessionId && docs.boundSessionId !== sessionId) {
      deny('Triple Crown: docs push authorization belongs to another Claude session.');
    }
    const files = listDiffFiles(root, docs.baseHead);
    if (files == null) deny('Triple Crown: could not inspect document-release commit range; push denied.');
    const forbidden = files.filter(f => !pathAllowed(f, docs.allowedPaths));
    if (forbidden.length) {
      deny(`Triple Crown: document-release push contains non-authorized paths: ${forbidden.join(', ')}. Re-run GSD verification/ship for runtime-affecting changes.`);
    }
    const r = bindAndConsume(docsPath, docs, sessionId, 'gitPush');
    if (!r.ok) deny(`Triple Crown docs guard: ${r.reason}`);
    allow(`Triple Crown: docs-only push authorized (${files.length} changed path(s)).`);
  }

  deny(
    'Triple Crown: GSD owns ship in this project. Run the GSD ship workflow; ' +
    'direct git push / PR creation from gstack /ship or another lifecycle is blocked.'
  );
});
