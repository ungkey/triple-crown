#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const { findProjectRoot, execGit } = require('./repo-state-lib.cjs');

function releasePath(phaseDir) {
  return path.join(path.resolve(phaseDir), 'RELEASE.json');
}
function readRelease(phaseDir) {
  const p = releasePath(phaseDir);
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}
function writeRelease(phaseDir, data) {
  fs.writeFileSync(releasePath(phaseDir), JSON.stringify(data, null, 2) + '\n');
}
function tryExec(cmd, args, cwd) {
  try {
    return cp.execFileSync(cmd, args, {
      cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 8 * 1024 * 1024
    }).trim();
  } catch {
    return null;
  }
}
function ghPr(root) {
  const out = tryExec('gh', [
    'pr', 'view',
    '--json', 'number,url,state,mergedAt,mergeCommit,headRefOid,headRefName,baseRefName'
  ], root);
  if (!out) return null;
  try {
    const p = JSON.parse(out);
    return {
      number: p.number ?? null,
      url: p.url ?? null,
      state: p.state ?? null,
      mergedAt: p.mergedAt ?? null,
      mergeCommitSha: p.mergeCommit && p.mergeCommit.oid || null,
      headSha: p.headRefOid ?? null,
      headRefName: p.headRefName ?? null,
      baseRefName: p.baseRefName ?? null,
    };
  } catch {
    return null;
  }
}
function effectiveSha(release) {
  if (release.pr && release.pr.state === 'MERGED' && release.pr.mergeCommitSha) return release.pr.mergeCommitSha;
  if (release.pr && release.pr.headSha) return release.pr.headSha;
  return release.git && release.git.head || null;
}
function phaseName(phaseDir) {
  return path.basename(path.resolve(phaseDir));
}
function capture(phaseDir) {
  const root = findProjectRoot(phaseDir);
  const prior = readRelease(phaseDir) || {};
  const head = execGit(root, ['rev-parse', 'HEAD']).trim();
  const branch = execGit(root, ['branch', '--show-current']).trim();
  const pr = ghPr(root);
  const data = {
    schema: 1,
    owner: 'gsd',
    phase: phaseName(phaseDir),
    phaseDir: path.resolve(phaseDir),
    capturedAt: new Date().toISOString(),
    git: { head, branch },
    pr,
    releaseState: pr
      ? (pr.state === 'MERGED' ? 'merged' : pr.state === 'OPEN' ? 'pr_open' : 'pr_closed')
      : 'local_or_unresolved',
    deployment: prior.deployment || null,
    postShip: prior.postShip || {
      documentRelease: { status: 'pending' },
      canary: { status: 'pending' },
      retro: { status: 'pending' }
    }
  };
  data.effectiveReleaseSha = effectiveSha(data);
  if (data.deployment) {
    data.deployment.matchesRelease = !!(
      data.deployment.deployedSha &&
      data.effectiveReleaseSha &&
      data.deployment.deployedSha === data.effectiveReleaseSha
    );
  }
  writeRelease(phaseDir, data);
  console.log(JSON.stringify(data, null, 2));
}
function parseArgs(args) {
  const out = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (!a.startsWith('--')) continue;
    const eq = a.indexOf('=');
    if (eq >= 0) out[a.slice(2, eq)] = a.slice(eq + 1);
    else {
      const key = a.slice(2);
      const next = args[i + 1];
      if (next != null && !next.startsWith('--')) { out[key] = next; i++; }
      else out[key] = true;
    }
  }
  return out;
}
function recordDeployment(phaseDir, args) {
  const root = findProjectRoot(phaseDir);
  let rel = readRelease(phaseDir);
  if (!rel) {
    capture(phaseDir);
    rel = readRelease(phaseDir);
  }
  const opts = parseArgs(args);
  const status = opts.status || 'deployed';
  if (!['pending','deployed','failed','rolled_back'].includes(status)) {
    throw new Error('--status must be pending|deployed|failed|rolled_back');
  }
  if (status === 'deployed' && !opts.url) throw new Error('--url is required for deployed status');
  const deployedSha = opts.sha || rel.effectiveReleaseSha || execGit(root, ['rev-parse', 'HEAD']).trim();
  rel.deployment = {
    status,
    environment: opts.environment || 'production',
    url: opts.url || null,
    deployedSha,
    deployedAt: opts.at || new Date().toISOString(),
    source: opts.source || 'explicit',
    evidence: opts.evidence || null,
    matchesRelease: deployedSha === rel.effectiveReleaseSha
  };
  rel.capturedAt = new Date().toISOString();
  writeRelease(phaseDir, rel);
  console.log(JSON.stringify(rel.deployment, null, 2));
}
function markPostShip(phaseDir, args) {
  const rel = readRelease(phaseDir);
  if (!rel) throw new Error('RELEASE.json missing');
  const opts = parseArgs(args);
  const component = opts.component;
  if (!['documentRelease','canary','retro'].includes(component)) {
    throw new Error('--component must be documentRelease|canary|retro');
  }
  rel.postShip = rel.postShip || {};
  rel.postShip[component] = {
    status: opts.status || 'unknown',
    updatedAt: new Date().toISOString(),
    note: opts.note || null,
    artifact: opts.artifact || null,
  };
  writeRelease(phaseDir, rel);
  console.log(JSON.stringify(rel.postShip[component], null, 2));
}
function ready(phaseDir) {
  const rel = readRelease(phaseDir);
  if (!rel) throw new Error('RELEASE.json missing');
  const dep = rel.deployment;
  const canaryReady = !!(
    dep &&
    dep.status === 'deployed' &&
    dep.url &&
    dep.deployedSha &&
    rel.effectiveReleaseSha &&
    dep.deployedSha === rel.effectiveReleaseSha
  );
  console.log(JSON.stringify({
    schema: 1,
    releaseState: rel.releaseState,
    effectiveReleaseSha: rel.effectiveReleaseSha,
    deployment: dep || null,
    canaryReady,
    documentReleasePrOpen: !!(rel.pr && rel.pr.state === 'OPEN'),
  }, null, 2));
}

try {
  const [cmd, phaseArg, ...rest] = process.argv.slice(2);
  if (!cmd || !phaseArg) {
    console.error('usage: release-ledger.cjs <capture|record-deployment|mark-post-ship|ready> <phaseDir> [options]');
    process.exit(2);
  }
  if (cmd === 'capture') capture(phaseArg);
  else if (cmd === 'record-deployment') recordDeployment(phaseArg, rest);
  else if (cmd === 'mark-post-ship') markPostShip(phaseArg, rest);
  else if (cmd === 'ready') ready(phaseArg);
  else throw new Error(`unknown command: ${cmd}`);
} catch (err) {
  console.error(`release-ledger: ${err.message}`);
  process.exit(1);
}
