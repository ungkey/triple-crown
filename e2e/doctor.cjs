#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { exec, which, gte, lt, findFiles, readJson } = require('./lib/common.cjs');

const argv = process.argv.slice(2);
const mock = argv.includes('--mock');
const jsonOnly = argv.includes('--json');

function result(id, status, message, details = {}) {
  return { id, status, message, ...details };
}
function cmdVersion(command, args = ['--version']) {
  if (!command) return null;
  const r = exec(command, args, { timeout: 15000 });
  if (r.code !== 0) return null;
  return (r.stdout || r.stderr).trim();
}
function resolveGsd() {
  if (process.env.TRIPLE_GSD_BIN) return process.env.TRIPLE_GSD_BIN;
  if (mock) return path.join(__dirname, 'mock-gsd.cjs');
  return which('gsd');
}
function detectGstack() {
  const env = process.env.TRIPLE_GSTACK_HOME;
  const candidates = [
    env,
    path.join(os.homedir(), '.claude', 'skills', 'gstack'),
  ].filter(Boolean);
  for (const root of candidates) {
    if (fs.existsSync(path.join(root, 'VERSION'))) return root;
  }
  return null;
}
function detectSuperpowers() {
  if (process.env.TRIPLE_SUPERPOWERS_HOME) {
    const root = process.env.TRIPLE_SUPERPOWERS_HOME;
    if (fs.existsSync(root)) return root;
  }
  const roots = [
    path.join(os.homedir(), '.claude'),
    path.join(os.homedir(), '.config', 'claude'),
  ];
  const hits = [];
  for (const root of roots) {
    hits.push(...findFiles(root, (p, name) =>
      name === 'SKILL.md' &&
      /skills[\\/]+using-superpowers[\\/]+SKILL\.md$/.test(p),
      { maxDepth: 9, maxResults: 8 }
    ));
  }
  if (!hits.length) return null;
  return path.dirname(path.dirname(hits[0]));
}

const checks = [];

const nodeV = process.version.replace(/^v/, '');
checks.push(result(
  'node',
  mock || gte(nodeV, [24,0,0]) ? (mock && !gte(nodeV,[24,0,0]) ? 'WARN' : 'PASS') : 'FAIL',
  mock && !gte(nodeV,[24,0,0])
    ? `Node ${nodeV}; real GSD 1.10 requires >=24, mock mode permits this runtime`
    : `Node ${nodeV}`,
  { observed: nodeV, required: '>=24.0.0', source: 'GSD 1.10 package engines' }
));

const npm = which('npm');
const npmV = cmdVersion(npm);
checks.push(result(
  'npm',
  mock || (npmV && gte(npmV, [10,0,0])) ? (mock && npmV && !gte(npmV,[10,0,0]) ? 'WARN' : 'PASS') : 'FAIL',
  npmV ? `npm ${npmV}` : 'npm not found',
  { observed: npmV, required: '>=10.0.0' }
));

for (const name of ['git']) {
  const p = which(name), v = cmdVersion(p);
  checks.push(result(name, p ? 'PASS' : 'FAIL', p ? `${name}: ${v || p}` : `${name} not found`, { path: p }));
}

const claude = which('claude');
checks.push(result('claude', claude ? 'PASS' : 'WARN',
  claude ? `Claude Code found: ${claude}` : 'Claude Code CLI not found in PATH; interactive L2 acceptance unavailable',
  { path: claude }));

const gh = which('gh');
checks.push(result('gh', gh ? 'PASS' : 'WARN',
  gh ? `GitHub CLI found: ${gh}` : 'gh not found; real GSD ship/PR acceptance unavailable',
  { path: gh }));

const bun = which('bun');
checks.push(result('bun', bun ? 'PASS' : 'WARN',
  bun ? `Bun found: ${cmdVersion(bun) || bun}` : 'Bun not found; current gstack setup requires Bun >=1.0',
  { path: bun, requiredFor: 'gstack install/setup' }));

const gsd = resolveGsd();
let gsdV = null;
if (mock) {
  gsdV = '1.10.0-mock';
} else if (gsd) {
  gsdV = cmdVersion(gsd);
}
let gsdStatus = 'FAIL';
if (mock) gsdStatus = 'PASS';
else if (gsdV && gte(gsdV, [1,10,0]) && lt(gsdV,[2,0,0])) gsdStatus = 'PASS';
else if (gsdV) gsdStatus = 'FAIL';
checks.push(result('gsd', gsdStatus,
  gsd ? `GSD: ${gsdV || gsd}` : 'gsd command not found',
  { path: gsd, observed: gsdV, required: '>=1.10.0 <2.0.0' }));

const gstackRoot = detectGstack();
if (gstackRoot) {
  const version = fs.readFileSync(path.join(gstackRoot,'VERSION'),'utf8').trim();
  const requiredSkills = ['plan-eng-review','review','qa-only','cso','canary','document-release','retro'];
  const missing = requiredSkills.filter(s => !fs.existsSync(path.join(gstackRoot, s, 'SKILL.md')));
  checks.push(result('gstack', missing.length ? 'FAIL' : 'PASS',
    missing.length ? `gstack ${version}; missing skills: ${missing.join(', ')}` : `gstack ${version}; required skills present`,
    { root: gstackRoot, version, missingSkills: missing }));
} else {
  checks.push(result('gstack', mock ? 'WARN' : 'FAIL',
    'gstack installation not found (set TRIPLE_GSTACK_HOME if installed elsewhere)'));
}

const spRoot = detectSuperpowers();
if (spRoot) {
  const required = ['using-superpowers','test-driven-development','systematic-debugging','verification-before-completion'];
  const missing = required.filter(s => !fs.existsSync(path.join(spRoot, s, 'SKILL.md')));
  checks.push(result('superpowers', missing.length ? 'FAIL' : 'PASS',
    missing.length ? `Superpowers skill root found but missing: ${missing.join(', ')}` : 'Required Superpowers skills present',
    { root: spRoot, missingSkills: missing }));
} else {
  checks.push(result('superpowers', mock ? 'WARN' : 'FAIL',
    'Superpowers installation not found (set TRIPLE_SUPERPOWERS_HOME to its skills directory)'));
}

const hardFails = checks.filter(c => c.status === 'FAIL');
const report = {
  schema: 1,
  mode: mock ? 'mock' : 'live',
  generatedAt: new Date().toISOString(),
  host: { platform: process.platform, arch: process.arch, cwd: process.cwd() },
  checks,
  summary: {
    pass: checks.filter(c => c.status === 'PASS').length,
    warn: checks.filter(c => c.status === 'WARN').length,
    fail: hardFails.length,
    ready: hardFails.length === 0,
  }
};

if (jsonOnly) process.stdout.write(JSON.stringify(report, null, 2) + '\n');
else {
  for (const c of checks) console.log(`${c.status.padEnd(4)} ${c.id.padEnd(14)} ${c.message}`);
  console.log(`\nREADY=${report.summary.ready} PASS=${report.summary.pass} WARN=${report.summary.warn} FAIL=${report.summary.fail}`);
}
process.exit(hardFails.length ? 1 : 0);
