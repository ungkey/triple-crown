#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { findProjectRoot, execGit } = require('./lib/repo-state-lib.cjs');

function tcDir(root) {
  const d = path.join(root, '.planning', '.triple-crown');
  fs.mkdirSync(d, { recursive: true });
  return d;
}
function authPath(root) { return path.join(tcDir(root), 'ship-auth.json'); }
function docsAuthPath(root) { return path.join(tcDir(root), 'docs-push-auth.json'); }

function nowMs() { return Date.now(); }
function iso(ms = Date.now()) { return new Date(ms).toISOString(); }

function configNumber(name, fallback) {
  try {
    const cp = require('child_process');
    const out = cp.execFileSync('gsd-tools', ['query', 'config-get', name], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    const n = Number(JSON.parse(out));
    return Number.isFinite(n) ? n : fallback;
  } catch {
    return fallback;
  }
}

function armGsd(phaseDir) {
  const root = findProjectRoot(phaseDir);
  const ttl = configNumber('triple_crown.ship.authorization_ttl_seconds', 300);
  const head = execGit(root, ['rev-parse', 'HEAD']).trim();
  const branch = execGit(root, ['branch', '--show-current']).trim();
  const started = nowMs();
  const auth = {
    schema: 1,
    kind: 'gsd-ship',
    owner: 'gsd',
    projectRoot: root,
    phaseDir: path.resolve(phaseDir),
    armedAt: iso(started),
    expiresAt: iso(started + ttl * 1000),
    headAtArm: head,
    branch,
    boundSessionId: null,
    actionCounts: {
      gitPush: 0,
      prCreate: 0
    },
    limits: {
      gitPush: 4,
      prCreate: 1
    }
  };
  fs.writeFileSync(authPath(root), JSON.stringify(auth, null, 2) + '\n');
  console.log(`Triple Crown ship owner armed: GSD (${branch}, expires ${auth.expiresAt})`);
}

function docsAllowList(allowVersion) {
  const list = [
    'README.md', 'README.*',
    'ARCHITECTURE.md', 'ARCHITECTURE.*',
    'CONTRIBUTING.md', 'CONTRIBUTING.*',
    'CLAUDE.md', 'AGENTS.md',
    'CHANGELOG.md', 'CHANGELOG.*',
    'TODOS.md',
    'docs/**'
  ];
  if (allowVersion) list.push('VERSION');
  return list;
}

function armDocs(phaseDir, allowVersion = false) {
  const root = findProjectRoot(phaseDir);
  const head = execGit(root, ['rev-parse', 'HEAD']).trim();
  const branch = execGit(root, ['branch', '--show-current']).trim();
  const started = nowMs();
  const ttl = 600;
  const auth = {
    schema: 1,
    kind: 'gstack-document-release',
    owner: 'gsd-post-ship',
    projectRoot: root,
    phaseDir: path.resolve(phaseDir),
    armedAt: iso(started),
    expiresAt: iso(started + ttl * 1000),
    baseHead: head,
    branch,
    boundSessionId: null,
    allowedPaths: docsAllowList(allowVersion),
    allowVersionBump: !!allowVersion,
    actionCounts: { gitPush: 0 },
    limits: { gitPush: 2 }
  };
  fs.writeFileSync(docsAuthPath(root), JSON.stringify(auth, null, 2) + '\n');
  console.log(`Triple Crown docs push armed (${branch}, VERSION=${allowVersion ? 'allowed' : 'denied'})`);
}

function unlinkSafe(p) {
  try { fs.unlinkSync(p); } catch (e) { if (e.code !== 'ENOENT') throw e; }
}
function disarmGsd(phaseDir) {
  const root = findProjectRoot(phaseDir);
  unlinkSafe(authPath(root));
  console.log('Triple Crown GSD ship authorization disarmed');
}
function disarmDocs(phaseDir) {
  const root = findProjectRoot(phaseDir);
  unlinkSafe(docsAuthPath(root));
  console.log('Triple Crown docs push authorization disarmed');
}
function disarm(phaseDir) {
  const root = findProjectRoot(phaseDir);
  unlinkSafe(authPath(root));
  unlinkSafe(docsAuthPath(root));
  console.log('Triple Crown ship authorization disarmed');
}

function status(phaseDir) {
  const root = findProjectRoot(phaseDir);
  const out = {};
  for (const [key, p] of [['ship', authPath(root)], ['docs', docsAuthPath(root)]]) {
    out[key] = fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : null;
  }
  console.log(JSON.stringify(out, null, 2));
}

try {
  const [cmd, phaseArg, ...rest] = process.argv.slice(2);
  if (!cmd || !phaseArg) {
    console.error('usage: ship-guard-control.cjs <arm-gsd|arm-docs|disarm-gsd|disarm-docs|disarm|status> <phaseDir> [--allow-version]');
    process.exit(2);
  }
  if (cmd === 'arm-gsd') armGsd(phaseArg);
  else if (cmd === 'arm-docs') armDocs(phaseArg, rest.includes('--allow-version'));
  else if (cmd === 'disarm-gsd') disarmGsd(phaseArg);
  else if (cmd === 'disarm-docs') disarmDocs(phaseArg);
  else if (cmd === 'disarm') disarm(phaseArg);
  else if (cmd === 'status') status(phaseArg);
  else throw new Error(`unknown command: ${cmd}`);
} catch (err) {
  console.error(`ship-guard-control: ${err.message}`);
  process.exit(1);
}
