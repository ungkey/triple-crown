'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const cp = require('child_process');

function normalizePhaseDir(input) {
  if (!input) throw new Error('phase directory is required');
  return path.resolve(input);
}

function listPlanFiles(phaseDir) {
  if (!fs.existsSync(phaseDir) || !fs.statSync(phaseDir).isDirectory()) {
    throw new Error(`phase directory not found: ${phaseDir}`);
  }
  const names = fs.readdirSync(phaseDir)
    .filter((name) => name === 'PLAN.md' || /-PLAN\.md$/i.test(name))
    .sort();
  if (names.length === 0) {
    throw new Error(`no PLAN.md or *-PLAN.md files found in ${phaseDir}`);
  }
  return names;
}

function digestPlanSet(phaseDir) {
  const planFiles = listPlanFiles(phaseDir);
  const h = crypto.createHash('sha256');
  for (const name of planFiles) {
    const body = fs.readFileSync(path.join(phaseDir, name));
    h.update(Buffer.from(name, 'utf8'));
    h.update(Buffer.from([0]));
    h.update(body);
    h.update(Buffer.from([0]));
  }
  return {
    planFiles,
    digest: `sha256:${h.digest('hex')}`,
  };
}

function gitHead(cwd) {
  try {
    return cp.execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim() || null;
  } catch {
    return null;
  }
}

function findProjectRoot(start) {
  let cur = path.resolve(start);
  while (true) {
    if (fs.existsSync(path.join(cur, '.planning')) || fs.existsSync(path.join(cur, '.git'))) {
      return cur;
    }
    const parent = path.dirname(cur);
    if (parent === cur) return path.resolve(start);
    cur = parent;
  }
}

function markerPath(phaseDir) {
  return path.join(phaseDir, 'GSTACK-PLAN-REVIEW.json');
}

function reportPath(phaseDir) {
  return path.join(phaseDir, 'GSTACK-PLAN-REVIEW.md');
}

module.exports = {
  normalizePhaseDir,
  listPlanFiles,
  digestPlanSet,
  gitHead,
  findProjectRoot,
  markerPath,
  reportPath,
};
