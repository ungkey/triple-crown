#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const {
  captureSnapshot,
  compareSnapshots,
} = require('./lib/repo-state-lib.cjs');
const {
  seedSummaries,
  invalidateForSnapshot,
  loadStore,
} = require('./lib/evidence-store.cjs');

function stateDir(phaseDir) {
  const d = path.join(path.resolve(phaseDir), '.crew');
  fs.mkdirSync(d, { recursive: true });
  return d;
}
function prePath(phaseDir) {
  return path.join(stateDir(phaseDir), 'gstack-review-pre.json');
}
function mutationPath(phaseDir) {
  return path.join(path.resolve(phaseDir), 'MUTATION.json');
}
function reviewJsonPath(phaseDir) {
  return path.join(path.resolve(phaseDir), 'GSTACK-CODE-REVIEW.json');
}
function reviewMdPath(phaseDir) {
  return path.join(path.resolve(phaseDir), 'GSTACK-CODE-REVIEW.md');
}

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) { out._.push(a); continue; }
    const eq = a.indexOf('=');
    if (eq !== -1) { out[a.slice(2, eq)] = a.slice(eq + 1); continue; }
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next != null && !next.startsWith('--')) { out[key] = next; i++; }
    else out[key] = true;
  }
  return out;
}

function begin(phaseDir) {
  const seeded = seedSummaries(phaseDir);
  const snapshot = captureSnapshot(phaseDir);
  const pre = {
    schema: 1,
    reviewer: 'gstack/review',
    startedAt: new Date().toISOString(),
    snapshot,
    evidenceSeeded: seeded.added,
  };
  fs.writeFileSync(prePath(phaseDir), JSON.stringify(pre, null, 2) + '\n');
  return pre;
}

function finalize(phaseDir, opts) {
  const pp = prePath(phaseDir);
  if (!fs.existsSync(pp)) throw new Error(`missing review pre-snapshot: ${pp}; run begin first`);
  const pre = JSON.parse(fs.readFileSync(pp, 'utf8'));
  const post = captureSnapshot(phaseDir);
  const comparison = compareSnapshots(pre.snapshot, post);
  const finishedAt = new Date().toISOString();

  const status = opts.status || 'concerns';
  if (!['pass', 'concerns', 'blocked', 'unavailable'].includes(status)) {
    throw new Error('--status must be pass|concerns|blocked|unavailable');
  }

  let summary = opts.note || '';
  if (opts['summary-file']) {
    summary = fs.readFileSync(opts['summary-file'], 'utf8').trim();
  }

  let invalidation = null;
  if (comparison.changed) {
    invalidation = invalidateForSnapshot(
      phaseDir,
      post,
      'gstack/review',
      'External review changed repository state after GSD execution evidence was produced.'
    );
  }

  const mutation = {
    schema: 1,
    source: 'gstack/review',
    detectedAt: finishedAt,
    changed: comparison.changed,
    changedFiles: comparison.changedFiles,
    commits: comparison.commits,
    headChanged: comparison.headChanged,
    preSnapshot: pre.snapshot,
    postSnapshot: post,
    invalidation,
    freshVerificationRequired: comparison.changed,
  };
  fs.writeFileSync(mutationPath(phaseDir), JSON.stringify(mutation, null, 2) + '\n');

  const review = {
    schema: 1,
    reviewer: 'gstack/review',
    status,
    startedAt: pre.startedAt,
    finishedAt,
    summary: summary || null,
    mutated: comparison.changed,
    changedFiles: comparison.changedFiles,
    commits: comparison.commits,
    preSnapshot: {
      head: pre.snapshot.head,
      workspaceDigest: pre.snapshot.workspaceDigest,
    },
    postSnapshot: {
      head: post.head,
      workspaceDigest: post.workspaceDigest,
    },
    evidenceInvalidationId: invalidation ? invalidation.id : null,
    freshVerificationRequired: comparison.changed,
  };
  fs.writeFileSync(reviewJsonPath(phaseDir), JSON.stringify(review, null, 2) + '\n');

  const lines = [
    '# gstack Code Review',
    '',
    `- Reviewer: \`gstack/review\``,
    `- Status: **${status.toUpperCase()}**`,
    `- Started: ${pre.startedAt}`,
    `- Finished: ${finishedAt}`,
    `- Mutated repository: **${comparison.changed ? 'YES' : 'NO'}**`,
    `- Pre HEAD: \`${pre.snapshot.head}\``,
    `- Post HEAD: \`${post.head}\``,
    `- Post workspace digest: \`${post.workspaceDigest}\``,
    `- Fresh verification required: **${comparison.changed ? 'YES' : 'NO'}**`,
    '',
  ];
  if (comparison.changedFiles.length) {
    lines.push('## Mutation');
    lines.push('');
    for (const f of comparison.changedFiles) lines.push(`- \`${f}\``);
    lines.push('');
  }
  if (comparison.commits.length) {
    lines.push('## Commits created during review');
    lines.push('');
    for (const c of comparison.commits) lines.push(`- \`${c}\``);
    lines.push('');
  }
  lines.push('## Review summary');
  lines.push('');
  lines.push(summary || '_No normalized summary was supplied._');
  lines.push('');
  if (comparison.changed) {
    lines.push('## Evidence state');
    lines.push('');
    lines.push('Pre-review execution evidence that no longer matches the post-review workspace was marked **stale**.');
    lines.push('GSD verification must not continue until fresh post-review verification evidence is recorded for the current workspace.');
    lines.push('');
  }
  fs.writeFileSync(reviewMdPath(phaseDir), lines.join('\n'));

  return { review, mutation, evidence: loadStore(phaseDir) };
}

function main() {
  const [cmd, phaseArg, ...rest] = process.argv.slice(2);
  if (!cmd || !phaseArg) {
    console.error('usage: review-session.cjs <begin|finalize> <phaseDir> [options]');
    process.exit(2);
  }
  const phaseDir = path.resolve(phaseArg);
  if (cmd === 'begin') {
    console.log(JSON.stringify(begin(phaseDir), null, 2));
    return;
  }
  if (cmd === 'finalize') {
    console.log(JSON.stringify(finalize(phaseDir, parseArgs(rest)), null, 2));
    return;
  }
  throw new Error(`unknown command: ${cmd}`);
}

try { main(); }
catch (err) {
  console.error(`review-session: ${err.message}`);
  process.exit(1);
}
