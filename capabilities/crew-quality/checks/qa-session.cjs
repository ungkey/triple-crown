#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { captureSnapshot, compareSnapshots, sha256 } = require('./lib/repo-state-lib.cjs');

function stateDir(phaseDir) {
  const d = path.join(path.resolve(phaseDir), '.crew');
  fs.mkdirSync(d, { recursive: true });
  return d;
}
function prePath(phaseDir) { return path.join(stateDir(phaseDir), 'gstack-qa-pre.json'); }
function qaPath(phaseDir) { return path.join(path.resolve(phaseDir), 'GSTACK-QA.json'); }
function qaMdPath(phaseDir) { return path.join(path.resolve(phaseDir), 'GSTACK-QA.md'); }

function readNormalized(file) {
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (data.schema !== 1) throw new Error('normalized QA schema must be 1');
  if (!['pass','findings','blocked','unavailable'].includes(data.status)) {
    throw new Error(`invalid normalized QA status: ${data.status}`);
  }
  if (!Array.isArray(data.tests)) data.tests = [];
  if (!Array.isArray(data.findings)) data.findings = [];
  if (!Array.isArray(data.manualTests)) data.manualTests = [];
  return data;
}

function begin(phaseDir) {
  const snapshot = captureSnapshot(phaseDir);
  const data = { schema: 1, runner: 'gstack/qa-only', startedAt: new Date().toISOString(), snapshot };
  fs.writeFileSync(prePath(phaseDir), JSON.stringify(data, null, 2) + '\n');
  return data;
}

function finalize(phaseDir, normalizedFile) {
  const pp = prePath(phaseDir);
  if (!fs.existsSync(pp)) throw new Error(`missing QA pre-snapshot: ${pp}`);
  const pre = JSON.parse(fs.readFileSync(pp, 'utf8'));
  const normalized = readNormalized(normalizedFile);
  const post = captureSnapshot(phaseDir);
  const comparison = compareSnapshots(pre.snapshot, post);
  const finishedAt = new Date().toISOString();

  const unexpectedMutation = comparison.changed;
  let status = normalized.status;
  if (unexpectedMutation) status = 'blocked';

  const qa = {
    schema: 1,
    runner: 'gstack/qa-only',
    status,
    startedAt: pre.startedAt,
    finishedAt,
    target: normalized.target || null,
    healthScore: normalized.healthScore ?? null,
    summary: normalized.summary || null,
    tests: normalized.tests,
    findings: normalized.findings,
    manualTests: normalized.manualTests,
    evidence: Array.isArray(normalized.evidence) ? normalized.evidence : [],
    unexpectedMutation,
    mutation: {
      changed: comparison.changed,
      changedFiles: comparison.changedFiles,
      commits: comparison.commits,
      preWorkspaceDigest: comparison.preWorkspaceDigest,
      postWorkspaceDigest: comparison.postWorkspaceDigest,
    },
    workspace: { head: post.head, workspaceDigest: post.workspaceDigest },
  };
  qa.artifactDigest = sha256(Buffer.from(JSON.stringify(qa)));
  fs.writeFileSync(qaPath(phaseDir), JSON.stringify(qa, null, 2) + '\n');

  const lines = [
    '# gstack QA-only', '',
    `- Status: **${status.toUpperCase()}**`,
    `- Target: ${qa.target || 'unspecified'}`,
    `- Health score: ${qa.healthScore == null ? 'n/a' : qa.healthScore}`,
    `- Workspace digest: \`${qa.workspace.workspaceDigest}\``,
    `- Report-only mutation invariant: **${unexpectedMutation ? 'VIOLATED' : 'OK'}**`,
    `- Findings: ${qa.findings.length}`, '',
    '## Summary', '', qa.summary || '_No normalized summary supplied._', ''
  ];
  if (qa.findings.length) {
    lines.push('## Findings', '');
    for (const f of qa.findings) {
      lines.push(`- **${String(f.severity || 'major').toUpperCase()}** ${f.name || f.title || f.id || 'QA finding'}`);
      if (f.repro) lines.push(`  - Repro: ${f.repro}`);
      if (f.expected) lines.push(`  - Expected: ${f.expected}`);
      if (f.actual) lines.push(`  - Actual: ${f.actual}`);
    }
    lines.push('');
  }
  if (qa.evidence.length) {
    lines.push('## Evidence', '');
    for (const ev of qa.evidence) {
      lines.push(`- ${ev.kind || 'evidence'}: ${ev.ref || ev.path || ev.description || JSON.stringify(ev)}`);
    }
    lines.push('');
  }
  fs.writeFileSync(qaMdPath(phaseDir), lines.join('\n'));
  console.log(JSON.stringify(qa, null, 2));
}

function main() {
  const [cmd, phaseArg, normalizedFile] = process.argv.slice(2);
  if (!cmd || !phaseArg) throw new Error('usage: qa-session.cjs <begin|finalize> <phaseDir> [normalized.json]');
  const phaseDir = path.resolve(phaseArg);
  if (cmd === 'begin') console.log(JSON.stringify(begin(phaseDir), null, 2));
  else if (cmd === 'finalize') {
    if (!normalizedFile) throw new Error('normalized QA file required');
    finalize(phaseDir, path.resolve(normalizedFile));
  } else throw new Error(`unknown command: ${cmd}`);
}
try { main(); } catch (err) { console.error(`qa-session: ${err.message}`); process.exit(1); }
