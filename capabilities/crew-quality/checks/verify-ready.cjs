#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { captureSnapshot } = require('./lib/repo-state-lib.cjs');
const {
  loadStore,
  latestPostReviewVerification,
} = require('./lib/evidence-store.cjs');

function fail(code, message) {
  console.error(`Crew verify gate: ${message}`);
  process.exit(code);
}

try {
  const phaseDir = path.resolve(process.argv[2] || '');
  if (!process.argv[2]) fail(2, 'phase directory is required');

  const reviewPath = path.join(phaseDir, 'GSTACK-CODE-REVIEW.json');
  const mutationPath = path.join(phaseDir, 'MUTATION.json');

  if (!fs.existsSync(reviewPath)) fail(3, `missing ${path.basename(reviewPath)}; gstack code review has not completed`);
  if (!fs.existsSync(mutationPath)) fail(4, `missing ${path.basename(mutationPath)}; mutation state is unknown`);

  const review = JSON.parse(fs.readFileSync(reviewPath, 'utf8'));
  const mutation = JSON.parse(fs.readFileSync(mutationPath, 'utf8'));

  if (review.schema !== 1 || review.reviewer !== 'gstack/review') {
    fail(5, 'invalid gstack review artifact');
  }
  if (['blocked', 'unavailable'].includes(review.status)) {
    fail(6, `gstack review status is ${review.status}`);
  }
  if (!['pass', 'concerns'].includes(review.status)) {
    fail(7, `unsupported gstack review status: ${review.status}`);
  }

  const current = captureSnapshot(phaseDir);
  if (
    !review.postSnapshot ||
    review.postSnapshot.workspaceDigest !== current.workspaceDigest
  ) {
    fail(
      8,
      `review is stale: reviewed=${review.postSnapshot && review.postSnapshot.workspaceDigest} current=${current.workspaceDigest}. Re-run gstack review.`
    );
  }

  if (mutation.changed || review.freshVerificationRequired) {
    const store = loadStore(phaseDir);
    const since = mutation.invalidation && mutation.invalidation.at
      ? mutation.invalidation.at
      : review.finishedAt;
    const latest = latestPostReviewVerification(store, current.workspaceDigest, since);

    if (latest.length === 0) {
      fail(9, 'gstack mutated the repository but no fresh post-review verification evidence exists for the current workspace');
    }

    const failed = latest.filter((r) => r.status !== 'passed' || Number(r.exitCode) !== 0);
    if (failed.length) {
      fail(
        10,
        `fresh post-review verification is not green: ${failed.map((r) => `${r.command}=${r.status}/${r.exitCode}`).join(', ')}`
      );
    }
  }

  const concernNote = review.status === 'concerns'
    ? ' (review completed with concerns; GSD verifier must evaluate them)'
    : '';
  console.log(`Crew verify-ready: PASS${concernNote}`);
  process.exit(0);
} catch (err) {
  fail(20, err.message);
}
