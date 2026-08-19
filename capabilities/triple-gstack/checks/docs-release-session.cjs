#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const {
  captureSnapshot,
  compareSnapshots,
} = require('./repo-state-lib.cjs');

function stateDir(phaseDir) {
  const d = path.join(path.resolve(phaseDir), '.triple-crown');
  fs.mkdirSync(d, { recursive: true });
  return d;
}
function prePath(phaseDir) { return path.join(stateDir(phaseDir), 'document-release-pre.json'); }
function outPath(phaseDir) { return path.join(path.resolve(phaseDir), 'GSTACK-DOCUMENT-RELEASE.json'); }

function allowed(rel, allowVersion) {
  const p = rel.replace(/\\/g, '/');
  if (p === 'README.md' || /^README\./.test(p)) return true;
  if (p === 'ARCHITECTURE.md' || /^ARCHITECTURE\./.test(p)) return true;
  if (p === 'CONTRIBUTING.md' || /^CONTRIBUTING\./.test(p)) return true;
  if (p === 'CLAUDE.md' || p === 'AGENTS.md') return true;
  if (p === 'CHANGELOG.md' || /^CHANGELOG\./.test(p)) return true;
  if (p === 'TODOS.md') return true;
  if (p.startsWith('docs/')) return true;
  if (allowVersion && p === 'VERSION') return true;
  return false;
}

function begin(phaseDir, allowVersion) {
  const data = {
    schema: 1,
    runner: 'gstack/document-release',
    startedAt: new Date().toISOString(),
    allowVersionBump: !!allowVersion,
    snapshot: captureSnapshot(phaseDir),
  };
  fs.writeFileSync(prePath(phaseDir), JSON.stringify(data, null, 2) + '\n');
  console.log(JSON.stringify(data, null, 2));
}

function finalize(phaseDir, status, note) {
  const pre = JSON.parse(fs.readFileSync(prePath(phaseDir), 'utf8'));
  const post = captureSnapshot(phaseDir);
  const cmp = compareSnapshots(pre.snapshot, post);
  const forbidden = (cmp.changedFiles || []).filter(f => !allowed(f, pre.allowVersionBump));
  const result = {
    schema: 1,
    runner: 'gstack/document-release',
    status: forbidden.length ? 'blocked' : status,
    startedAt: pre.startedAt,
    finishedAt: new Date().toISOString(),
    allowVersionBump: pre.allowVersionBump,
    changed: cmp.changed,
    changedFiles: cmp.changedFiles,
    commits: cmp.commits,
    forbiddenFiles: forbidden,
    note: note || null,
    preSnapshot: {
      head: pre.snapshot.head,
      workspaceDigest: pre.snapshot.workspaceDigest,
    },
    postSnapshot: {
      head: post.head,
      workspaceDigest: post.workspaceDigest,
    }
  };
  fs.writeFileSync(outPath(phaseDir), JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result, null, 2));
  if (forbidden.length) process.exitCode = 9;
}

try {
  const [cmd, phaseArg, ...rest] = process.argv.slice(2);
  if (!cmd || !phaseArg) throw new Error('usage: docs-release-session.cjs <begin|finalize> <phaseDir> [options]');
  const phaseDir = path.resolve(phaseArg);
  if (cmd === 'begin') {
    begin(phaseDir, rest.includes('--allow-version'));
  } else if (cmd === 'finalize') {
    let status = 'pass', note = '';
    for (let i = 0; i < rest.length; i++) {
      if (rest[i] === '--status') status = rest[++i] || status;
      else if (rest[i].startsWith('--status=')) status = rest[i].slice(9);
      else if (rest[i] === '--note') note = rest[++i] || '';
      else if (rest[i].startsWith('--note=')) note = rest[i].slice(7);
    }
    if (!['pass','skipped','blocked','unavailable'].includes(status)) throw new Error('invalid --status');
    finalize(phaseDir, status, note);
  } else throw new Error(`unknown command: ${cmd}`);
} catch (err) {
  console.error(`docs-release-session: ${err.message}`);
  process.exit(1);
}
