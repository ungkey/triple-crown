#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { findProjectRoot } = require('./repo-state-lib.cjs');

function listPhaseDirs(root) {
  const phasesRoot = path.join(root, '.planning', 'phases');
  if (!fs.existsSync(phasesRoot)) return [];
  return fs.readdirSync(phasesRoot)
    .map((name) => ({ name, abs: path.join(phasesRoot, name) }))
    .filter((x) => fs.existsSync(x.abs) && fs.statSync(x.abs).isDirectory());
}

function normNum(s) {
  const n = String(s).trim();
  if (!/^\d+(?:\.\d+)?$/.test(n)) return null;
  const [a, b] = n.split('.');
  return b == null ? String(Number(a)) : `${Number(a)}.${Number(b)}`;
}

function phaseNumberFromName(name) {
  const m = String(name).match(/^(\d+(?:\.\d+)?)(?:-|$)/);
  return m ? normNum(m[1]) : null;
}

function resolveExplicit(root, token) {
  if (!token) return null;
  const maybePath = path.resolve(token);
  if (fs.existsSync(maybePath) && fs.statSync(maybePath).isDirectory()) return maybePath;

  const num = normNum(token);
  const dirs = listPhaseDirs(root);
  let matches;
  if (num) {
    matches = dirs.filter((d) => phaseNumberFromName(d.name) === num);
  } else {
    const low = String(token).toLowerCase();
    matches = dirs.filter((d) => d.name.toLowerCase() === low || d.name.toLowerCase().includes(low));
  }
  if (matches.length === 1) return matches[0].abs;
  if (matches.length > 1) throw new Error(`ambiguous phase token ${token}: ${matches.map(x => x.name).join(', ')}`);
  return null;
}

function fromState(root) {
  const state = path.join(root, '.planning', 'STATE.md');
  if (!fs.existsSync(state)) return null;
  const text = fs.readFileSync(state, 'utf8');
  const patterns = [
    /Current\s+Phase\s*:\s*(\d+(?:\.\d+)?)/i,
    /Active\s+Phase\s*:\s*(\d+(?:\.\d+)?)/i,
    /^\s*Phase\s*:\s*(\d+(?:\.\d+)?)/im,
    /current_phase["']?\s*[:=]\s*["']?(\d+(?:\.\d+)?)/i,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m) return resolveExplicit(root, m[1]);
  }
  return null;
}

function resolve(token) {
  const root = findProjectRoot(process.cwd());
  const explicit = resolveExplicit(root, token);
  if (explicit) return explicit;

  if (token) throw new Error(`could not resolve phase: ${token}`);

  const state = fromState(root);
  if (state) return state;

  const dirs = listPhaseDirs(root);
  if (dirs.length === 1) return dirs[0].abs;

  const executed = dirs.filter((d) =>
    fs.readdirSync(d.abs).some((name) => name === 'SUMMARY.md' || /-SUMMARY\.md$/i.test(name))
  );
  if (executed.length === 1) return executed[0].abs;

  throw new Error('phase is ambiguous; pass a phase number/path explicitly');
}

try {
  console.log(resolve(process.argv[2] || null));
} catch (err) {
  console.error(`resolve-phase-dir: ${err.message}`);
  process.exit(1);
}
