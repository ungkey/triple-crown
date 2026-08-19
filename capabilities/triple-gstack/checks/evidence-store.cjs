#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const {
  captureSnapshot,
  sha256,
} = require('./repo-state-lib.cjs');

function evidencePath(phaseDir) {
  return path.join(path.resolve(phaseDir), 'EVIDENCE.json');
}

function now() {
  return new Date().toISOString();
}

function newStore(phaseDir) {
  return {
    schema: 1,
    phaseDir: path.resolve(phaseDir),
    createdAt: now(),
    updatedAt: now(),
    records: [],
    invalidations: [],
  };
}

function loadStore(phaseDir) {
  const p = evidencePath(phaseDir);
  if (!fs.existsSync(p)) return newStore(phaseDir);
  const data = JSON.parse(fs.readFileSync(p, 'utf8'));
  if (data.schema !== 1 || !Array.isArray(data.records) || !Array.isArray(data.invalidations)) {
    throw new Error(`unsupported/corrupt evidence store: ${p}`);
  }
  return data;
}

function saveStore(phaseDir, store) {
  store.updatedAt = now();
  fs.writeFileSync(evidencePath(phaseDir), JSON.stringify(store, null, 2) + '\n');
}

function id(prefix = 'EV') {
  const rand = crypto.randomBytes(5).toString('hex');
  return `${prefix}-${Date.now()}-${rand}`;
}

function artifactDigest(file) {
  return sha256(fs.readFileSync(file));
}

function summaryFiles(phaseDir) {
  return fs.readdirSync(phaseDir)
    .filter((name) => name === 'SUMMARY.md' || /-SUMMARY\.md$/i.test(name))
    .sort();
}

function seedSummaries(phaseDir) {
  const store = loadStore(phaseDir);
  const snapshot = captureSnapshot(phaseDir);
  let added = 0;

  for (const name of summaryFiles(phaseDir)) {
    const abs = path.join(phaseDir, name);
    const digest = artifactDigest(abs);
    const exists = store.records.some((r) =>
      r.kind === 'gsd-summary-artifact' &&
      r.artifact === name &&
      r.artifactDigest === digest &&
      r.snapshot && r.snapshot.workspaceDigest === snapshot.workspaceDigest &&
      r.validity === 'current'
    );
    if (exists) continue;

    store.records.push({
      id: id(),
      kind: 'gsd-summary-artifact',
      producer: 'gsd-execution',
      status: 'observed',
      validity: 'current',
      createdAt: now(),
      artifact: name,
      artifactDigest: digest,
      command: null,
      exitCode: null,
      outputDigest: null,
      note: 'Observed GSD execution summary artifact before external review.',
      snapshot: {
        head: snapshot.head,
        workspaceDigest: snapshot.workspaceDigest,
      },
    });
    added++;
  }

  saveStore(phaseDir, store);
  return { added, snapshot, path: evidencePath(phaseDir) };
}

function invalidateForSnapshot(phaseDir, postSnapshot, source, reason) {
  const store = loadStore(phaseDir);
  const invalidationId = id('INV');
  const at = now();
  const staleIds = [];

  for (const record of store.records) {
    if (
      record.validity === 'current' &&
      record.snapshot &&
      record.snapshot.workspaceDigest !== postSnapshot.workspaceDigest
    ) {
      record.validity = 'stale';
      record.invalidatedAt = at;
      record.invalidatedBy = source;
      record.invalidationId = invalidationId;
      staleIds.push(record.id);
    }
  }

  const invalidation = {
    id: invalidationId,
    at,
    source,
    reason,
    targetSnapshot: {
      head: postSnapshot.head,
      workspaceDigest: postSnapshot.workspaceDigest,
    },
    staleRecordIds: staleIds,
  };
  store.invalidations.push(invalidation);
  saveStore(phaseDir, store);
  return invalidation;
}

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) { out._.push(a); continue; }
    const eq = a.indexOf('=');
    if (eq !== -1) {
      out[a.slice(2, eq)] = a.slice(eq + 1);
      continue;
    }
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next != null && !next.startsWith('--')) {
      out[key] = next;
      i++;
    } else {
      out[key] = true;
    }
  }
  return out;
}

function recordEvidence(phaseDir, opts) {
  const store = loadStore(phaseDir);
  const snapshot = captureSnapshot(phaseDir);
  const exitCode = opts['exit-code'] == null ? null : Number(opts['exit-code']);
  let status = opts.status;
  if (!status && exitCode != null) status = exitCode === 0 ? 'passed' : 'failed';
  if (!status) throw new Error('--status or --exit-code is required');

  let command = opts.command || null;
  if (opts['command-file']) {
    command = fs.readFileSync(opts['command-file'], 'utf8').trim();
  }

  let outputDigest = opts['output-digest'] || null;
  if (opts['output-file']) {
    outputDigest = artifactDigest(opts['output-file']);
  }

  const record = {
    id: id(),
    kind: opts.kind || 'verification',
    producer: opts.producer || 'triple-crown',
    status,
    validity: 'current',
    createdAt: now(),
    artifact: opts.artifact || null,
    artifactDigest: opts.artifact && fs.existsSync(opts.artifact) ? artifactDigest(opts.artifact) : null,
    command,
    exitCode,
    outputDigest,
    note: opts.note || null,
    snapshot: {
      head: snapshot.head,
      workspaceDigest: snapshot.workspaceDigest,
    },
  };
  store.records.push(record);
  saveStore(phaseDir, store);
  return record;
}

function latestPostReviewVerification(store, currentDigest, since) {
  const candidates = store.records.filter((r) =>
    r.kind === 'post-review-verification' &&
    r.validity === 'current' &&
    r.snapshot &&
    r.snapshot.workspaceDigest === currentDigest &&
    (!since || r.createdAt >= since) &&
    typeof r.command === 'string' &&
    r.command.length > 0
  );

  const latest = new Map();
  for (const r of candidates.sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
    latest.set(r.command, r);
  }
  return [...latest.values()];
}

function main() {
  const [cmd, phaseArg, ...rest] = process.argv.slice(2);
  if (!cmd || !phaseArg) {
    console.error('usage: evidence-store.cjs <seed-summaries|record|show> <phaseDir> [options]');
    process.exit(2);
  }
  const phaseDir = path.resolve(phaseArg);

  if (cmd === 'seed-summaries') {
    console.log(JSON.stringify(seedSummaries(phaseDir), null, 2));
    return;
  }
  if (cmd === 'record') {
    const opts = parseArgs(rest);
    console.log(JSON.stringify(recordEvidence(phaseDir, opts), null, 2));
    return;
  }
  if (cmd === 'show') {
    console.log(JSON.stringify(loadStore(phaseDir), null, 2));
    return;
  }
  throw new Error(`unknown command: ${cmd}`);
}

if (require.main === module) {
  try { main(); }
  catch (err) {
    console.error(`evidence-store: ${err.message}`);
    process.exit(1);
  }
}

module.exports = {
  evidencePath,
  loadStore,
  saveStore,
  seedSummaries,
  invalidateForSnapshot,
  recordEvidence,
  latestPostReviewVerification,
};
