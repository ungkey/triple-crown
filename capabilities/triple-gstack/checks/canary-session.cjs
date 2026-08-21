#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const {
  captureSnapshot,
  compareSnapshots,
} = require('./lib/repo-state-lib.cjs');

function stateDir(phaseDir) {
  const d = path.join(path.resolve(phaseDir), '.triple-crown');
  fs.mkdirSync(d, { recursive: true });
  return d;
}
function prePath(phaseDir) { return path.join(stateDir(phaseDir), 'canary-pre.json'); }
function outPath(phaseDir) { return path.join(path.resolve(phaseDir), 'GSTACK-CANARY.json'); }

function readRelease(phaseDir) {
  const p = path.join(path.resolve(phaseDir), 'RELEASE.json');
  if (!fs.existsSync(p)) throw new Error('RELEASE.json missing');
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function begin(phaseDir) {
  const release = readRelease(phaseDir);
  const dep = release.deployment;
  const ready = !!(
    dep &&
    dep.status === 'deployed' &&
    dep.url &&
    dep.deployedSha &&
    release.effectiveReleaseSha &&
    dep.deployedSha === release.effectiveReleaseSha
  );
  if (!ready) {
    throw new Error('deployment evidence is not ready/matching for canary');
  }
  const pre = {
    schema: 1,
    runner: 'gstack/canary',
    startedAt: new Date().toISOString(),
    releaseSha: release.effectiveReleaseSha,
    deployment: dep,
    snapshot: captureSnapshot(phaseDir),
  };
  fs.writeFileSync(prePath(phaseDir), JSON.stringify(pre, null, 2) + '\n');
  console.log(JSON.stringify(pre, null, 2));
}

function finalize(phaseDir, normalizedFile) {
  const pre = JSON.parse(fs.readFileSync(prePath(phaseDir), 'utf8'));
  const n = JSON.parse(fs.readFileSync(normalizedFile, 'utf8'));
  if (n.schema !== 1) throw new Error('normalized canary schema must be 1');
  if (!['pass','alert','blocked','unavailable'].includes(n.status)) throw new Error('invalid canary status');

  const post = captureSnapshot(phaseDir);
  const cmp = compareSnapshots(pre.snapshot, post);
  let status = n.status;
  if (cmp.changed) status = 'blocked';

  const out = {
    schema: 1,
    runner: 'gstack/canary',
    status,
    startedAt: pre.startedAt,
    finishedAt: new Date().toISOString(),
    url: pre.deployment.url,
    environment: pre.deployment.environment,
    releaseSha: pre.releaseSha,
    deployedSha: pre.deployment.deployedSha,
    mode: n.mode || 'quick',
    summary: n.summary || null,
    findings: Array.isArray(n.findings) ? n.findings : [],
    evidence: Array.isArray(n.evidence) ? n.evidence : [],
    unexpectedMutation: cmp.changed,
    mutation: {
      changed: cmp.changed,
      changedFiles: cmp.changedFiles,
      commits: cmp.commits,
    }
  };
  fs.writeFileSync(outPath(phaseDir), JSON.stringify(out, null, 2) + '\n');
  console.log(JSON.stringify(out, null, 2));
  if (cmp.changed) process.exitCode = 9;
}

try {
  const [cmd, phaseArg, normalized] = process.argv.slice(2);
  if (!cmd || !phaseArg) throw new Error('usage: canary-session.cjs <begin|finalize> <phaseDir> [normalized.json]');
  const phaseDir = path.resolve(phaseArg);
  if (cmd === 'begin') begin(phaseDir);
  else if (cmd === 'finalize') {
    if (!normalized) throw new Error('normalized canary file required');
    finalize(phaseDir, path.resolve(normalized));
  } else throw new Error(`unknown command: ${cmd}`);
} catch (err) {
  console.error(`canary-session: ${err.message}`);
  process.exit(1);
}
