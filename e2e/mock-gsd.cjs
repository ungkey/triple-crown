#!/usr/bin/env node
'use strict';

/*
 * Minimal deterministic stand-in for the subset of the GSD CLI used by the
 * v0.6 harness. It validates the harness itself; it is NOT evidence that real
 * GSD accepts the capability.
 */

const fs = require('fs');
const path = require('path');

function copy(src, dst) { fs.cpSync(src, dst, { recursive: true, force: true }); }
function mkdirp(p) { fs.mkdirSync(p, { recursive: true }); }
function readJson(p) { return JSON.parse(fs.readFileSync(p, 'utf8')); }
function writeJson(p, o) { mkdirp(path.dirname(p)); fs.writeFileSync(p, JSON.stringify(o, null, 2) + '\n'); }

function init(cwd) {
  mkdirp(path.join(cwd, '.gsd'));
  mkdirp(path.join(cwd, '.planning'));
  if (!fs.existsSync(path.join(cwd, '.planning', 'STATE.md'))) {
    fs.writeFileSync(path.join(cwd, '.planning', 'STATE.md'), 'Current Phase: 1\n');
  }
  console.log(JSON.stringify({ status: 'initialized', mock: true }));
}

function ledgerPath(cwd) { return path.join(cwd, '.gsd-capabilities.json'); }
function loadLedger(cwd) {
  const p = ledgerPath(cwd);
  if (!fs.existsSync(p)) return { schema: 1, capabilities: [] };
  return readJson(p);
}

function install(cwd, spec) {
  const src = path.resolve(cwd, spec);
  const manifest = readJson(path.join(src, 'capability.json'));
  const dest = path.join(cwd, '.gsd', 'capabilities', manifest.id);
  mkdirp(path.dirname(dest));
  fs.rmSync(dest, { recursive: true, force: true });
  copy(src, dest);

  const led = loadLedger(cwd);
  led.capabilities = (led.capabilities || []).filter(x => x.id !== manifest.id);
  led.capabilities.push({
    id: manifest.id,
    role: manifest.role,
    version: manifest.version,
    tier: manifest.tier,
    source: spec,
    scope: 'project',
    status: 'active',
    reason: null,
    title: manifest.title,
  });
  writeJson(ledgerPath(cwd), led);
  console.log(JSON.stringify({
    status: 'installed', id: manifest.id, version: manifest.version,
    scope: 'project', disclosure: ['mock install — no trust semantics exercised']
  }, null, 2));
}

function list(cwd) {
  const led = loadLedger(cwd);
  console.log(JSON.stringify(led.capabilities || [], null, 2));
}

function defaultConfig(manifest) {
  const out = {};
  for (const [k, v] of Object.entries(manifest.config || {})) {
    if (Object.prototype.hasOwnProperty.call(v, 'default')) out[k] = v.default;
  }
  return out;
}
function whenActive(hook, cfg) {
  if (!hook.when) return true;
  return cfg[hook.when] !== false && cfg[hook.when] !== 'off';
}

function materializeHook(capId, kind, hook) {
  const h = { capId, kind, point: hook.point };
  if (hook.into) h.into = hook.into;
  if (hook.ref) h.ref = hook.ref;
  if (hook.fragment) h.fragment = hook.fragment;
  if (hook.check) h.check = hook.check;
  if (hook.produces) h.produces = hook.produces;
  if (hook.consumes) h.consumes = hook.consumes;
  if (hook.blocking != null) h.blocking = hook.blocking;
  if (hook.onError) h.onError = hook.onError;
  if (hook.when) h.when = hook.when;
  return h;
}

function topoSteps(steps) {
  const remaining = steps.slice();
  const produced = new Set();
  const result = [];
  let progress = true;
  while (remaining.length && progress) {
    progress = false;
    for (let i = 0; i < remaining.length; i++) {
      const s = remaining[i];
      const deps = (s.consumes || []).filter(c =>
        remaining.some(other => (other.produces || []).includes(c))
      );
      const ready = deps.every(d => produced.has(d));
      if (ready) {
        result.push(s);
        for (const p of s.produces || []) produced.add(p);
        remaining.splice(i, 1);
        i--;
        progress = true;
      }
    }
  }
  result.push(...remaining);
  return result;
}

function renderHooks(cwd, point) {
  const capsRoot = path.join(cwd, '.gsd', 'capabilities');
  const hooks = [];
  if (fs.existsSync(capsRoot)) {
    for (const name of fs.readdirSync(capsRoot).sort()) {
      const mp = path.join(capsRoot, name, 'capability.json');
      if (!fs.existsSync(mp)) continue;
      const m = readJson(mp), cfg = defaultConfig(m);
      for (const c of m.contributions || []) if (c.point === point && whenActive(c,cfg)) {
        hooks.push(materializeHook(m.id, 'contribution', c));
      }
      const steps = [];
      for (const s of m.steps || []) if (s.point === point && whenActive(s,cfg)) {
        steps.push(materializeHook(m.id, 'step', s));
      }
      hooks.push(...topoSteps(steps));
      for (const g of m.gates || []) if (g.point === point && whenActive(g,cfg)) {
        hooks.push(materializeHook(m.id, 'gate', g));
      }
    }
  }
  console.log(JSON.stringify({ point, activeHooks: hooks, rendered: '' }, null, 2));
}

const args = process.argv.slice(2);
const cwd = process.cwd();

if (args[0] === '--version' || args[0] === 'version') {
  console.log('1.10.0-mock');
} else if (args[0] === 'init') {
  init(cwd);
} else if (args[0] === 'capability' && args[1] === 'install') {
  if (!args[2]) { console.error('missing spec'); process.exit(2); }
  install(cwd, args[2]);
} else if (args[0] === 'capability' && args[1] === 'list') {
  list(cwd);
} else if (args[0] === 'loop' && args[1] === 'render-hooks') {
  if (!args[2]) { console.error('missing point'); process.exit(2); }
  renderHooks(cwd, args[2]);
} else {
  console.error(`mock-gsd: unsupported args: ${args.join(' ')}`);
  process.exit(2);
}
