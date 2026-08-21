#!/usr/bin/env node
'use strict';

const fs = require('fs');

function fail(msg) {
  console.error(`HOOK CONTRACT FAIL: ${msg}`);
  process.exit(1);
}
function load(p) {
  const d = JSON.parse(fs.readFileSync(p, 'utf8'));
  if (!Array.isArray(d.activeHooks)) fail(`${p}: activeHooks missing`);
  return d.activeHooks;
}
function match(h, q) {
  if (q.capId && h.capId !== q.capId) return false;
  if (q.kind && h.kind !== q.kind) return false;
  if (q.skill && (!h.ref || h.ref.skill !== q.skill)) return false;
  if (q.into && h.into !== q.into) return false;
  if (q.commandIncludes) {
    const cmd = h.check && h.check.predicate && h.check.predicate.command || '';
    if (!cmd.includes(q.commandIncludes)) return false;
  }
  return true;
}
function requireOne(hooks, q, label) {
  const m = hooks.filter(h => match(h,q));
  if (m.length !== 1) fail(`${label}: expected exactly one, found ${m.length}`);
  return m[0];
}
function order(hooks, skills, label) {
  const idx = skills.map(s => hooks.findIndex(h => h.kind === 'step' && h.ref && h.ref.skill === s));
  if (idx.some(i => i < 0)) fail(`${label}: missing skill(s) ${skills.filter((_,i)=>idx[i]<0).join(', ')}`);
  for (let i = 1; i < idx.length; i++) if (idx[i] <= idx[i-1]) {
    fail(`${label}: wrong order ${skills.join(' -> ')}; indices=${idx.join(',')}`);
  }
}

const dir = process.argv[2];
if (!dir) fail('usage: assert-hooks.cjs <render-output-dir>');

const plan = load(`${dir}/plan-post.json`);
const wave = load(`${dir}/execute-wave-pre.json`);
const execPost = load(`${dir}/execute-post.json`);
const verify = load(`${dir}/verify-pre.json`);
const shipPre = load(`${dir}/ship-pre.json`);
const shipPost = load(`${dir}/ship-post.json`);

requireOne(plan, {capId:'crew-quality',kind:'gate',commandIncludes:'plan-review-current.cjs'}, 'plan-review gate');
requireOne(wave, {capId:'crew-discipline',kind:'contribution',into:'executor'}, 'superpowers executor contribution');

order(execPost, [
  'crew-gsd-review',
  'crew-gsd-qa',
  'crew-gsd-sec',
], 'execute:post quality chain');

requireOne(verify, {capId:'crew-quality',kind:'gate',commandIncludes:'verify-ready.cjs'}, 'verify evidence gate');
requireOne(verify, {capId:'crew-quality',kind:'gate',commandIncludes:'qa-ready.cjs'}, 'QA ready gate');

requireOne(shipPre, {capId:'crew-quality',kind:'gate',commandIncludes:'security-ready.cjs'}, 'external security ship gate');
requireOne(shipPre, {capId:'crew-ship',kind:'gate',commandIncludes:'ship-guard-control.cjs'}, 'GSD ship authorization gate');

const post = requireOne(shipPost, {capId:'crew-ship',kind:'step',skill:'crew-gsd-postship'}, 'post-ship release adapter');
if (post.onError !== 'skip') fail('ship:post adapter must be best-effort onError=skip');

console.log('PASS hook contract: plan -> execute -> verify -> ship surfaces');
