#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const {
  normalizePhaseDir,
  digestPlanSet,
  gitHead,
  findProjectRoot,
  markerPath,
  reportPath,
} = require('./plan-review-lib.cjs');

function parseArgs(argv) {
  const args = { phaseDir: null, status: 'pass', note: '' };
  const rest = [...argv];
  args.phaseDir = rest.shift() || null;
  while (rest.length) {
    const arg = rest.shift();
    if (arg === '--status') args.status = rest.shift() || '';
    else if (arg.startsWith('--status=')) args.status = arg.slice('--status='.length);
    else if (arg === '--note') args.note = rest.shift() || '';
    else if (arg.startsWith('--note=')) args.note = arg.slice('--note='.length);
    else throw new Error(`unknown argument: ${arg}`);
  }
  if (!['pass', 'blocked'].includes(args.status)) {
    throw new Error(`--status must be pass or blocked`);
  }
  return args;
}

try {
  const args = parseArgs(process.argv.slice(2));
  const phaseDir = normalizePhaseDir(args.phaseDir);
  const current = digestPlanSet(phaseDir);
  const projectRoot = findProjectRoot(phaseDir);
  const reviewedAt = new Date().toISOString();
  const marker = {
    schema: 1,
    reviewer: 'gstack/plan-eng-review',
    status: args.status,
    reviewedAt,
    planDigest: current.digest,
    planFiles: current.planFiles,
    gitHead: gitHead(projectRoot),
    note: args.note || null,
  };

  fs.writeFileSync(markerPath(phaseDir), JSON.stringify(marker, null, 2) + '\n');

  const md = [
    '# gstack Plan Review',
    '',
    `- Reviewer: \`gstack/plan-eng-review\``,
    `- Status: **${args.status.toUpperCase()}**`,
    `- Reviewed at: ${reviewedAt}`,
    `- PLAN digest: \`${current.digest}\``,
    `- PLAN files: ${current.planFiles.map(f => `\`${f}\``).join(', ')}`,
    marker.gitHead ? `- Git HEAD: \`${marker.gitHead}\`` : '- Git HEAD: unavailable',
    args.note ? `- Note: ${args.note}` : null,
    '',
    'This marker records that the current PLAN byte set was reviewed interactively.',
    'Any later PLAN edit changes the digest and makes the plan:post gate fail closed.',
    ''
  ].filter(Boolean).join('\n');

  fs.writeFileSync(reportPath(phaseDir), md);
  console.log(`marked ${args.status}: ${markerPath(phaseDir)}`);
  console.log(current.digest);
} catch (err) {
  console.error(`mark-plan-reviewed: ${err.message}`);
  process.exit(1);
}
