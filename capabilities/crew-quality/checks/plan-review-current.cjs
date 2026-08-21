#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const {
  normalizePhaseDir,
  digestPlanSet,
  markerPath,
} = require('./plan-review-lib.cjs');

function fail(code, message, phaseDir) {
  console.error(`Crew gstack plan-review gate: ${message}`);
  if (phaseDir) {
    console.error('');
    console.error('Required recovery:');
    console.error('  1. In the interactive main session, run gstack /plan-eng-review against the GSD plan.');
    console.error('  2. Resolve/accept its interactive findings and let the approved PLAN settle.');
    console.error(`  3. Mark that exact plan set as reviewed:`);
    console.error(`     node .gsd/capabilities/crew-quality/checks/mark-plan-reviewed.cjs ${JSON.stringify(phaseDir)} --status pass`);
    console.error('  4. Resume/re-run the GSD plan step. If PLAN files change later, this gate will become stale again.');
  }
  process.exit(code);
}

let phaseDir;
try {
  phaseDir = normalizePhaseDir(process.argv[2]);
  const current = digestPlanSet(phaseDir);
  const file = markerPath(phaseDir);

  if (!fs.existsSync(file)) {
    fail(2, `missing ${path.basename(file)}`, phaseDir);
  }

  let marker;
  try {
    marker = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    fail(3, `invalid review marker JSON: ${err.message}`, phaseDir);
  }

  if (marker.schema !== 1) {
    fail(4, `unsupported marker schema: ${marker.schema}`, phaseDir);
  }
  if (marker.reviewer !== 'gstack/plan-eng-review') {
    fail(5, `unexpected reviewer: ${marker.reviewer || '(missing)'}`, phaseDir);
  }
  if (marker.status !== 'pass') {
    fail(6, `review status is ${marker.status || '(missing)'}, not pass`, phaseDir);
  }
  if (marker.planDigest !== current.digest) {
    fail(
      7,
      `stale review: marker=${marker.planDigest || '(missing)'} current=${current.digest}`,
      phaseDir
    );
  }

  const markerFiles = Array.isArray(marker.planFiles) ? marker.planFiles : [];
  if (JSON.stringify(markerFiles) !== JSON.stringify(current.planFiles)) {
    fail(8, 'stale review: PLAN file set changed', phaseDir);
  }

  console.log(`gstack plan review current: ${current.digest}`);
  process.exit(0);
} catch (err) {
  fail(10, err.message, phaseDir);
}
