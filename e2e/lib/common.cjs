'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const cp = require('child_process');

function exec(cmd, args = [], opts = {}) {
  const p = cp.spawnSync(cmd, args, {
    cwd: opts.cwd || process.cwd(),
    env: opts.env || process.env,
    encoding: 'utf8',
    input: opts.input,
    timeout: opts.timeout || 60000,
    maxBuffer: 32 * 1024 * 1024,
  });
  return {
    code: p.status == null ? 1 : p.status,
    stdout: p.stdout || '',
    stderr: p.stderr || '',
    error: p.error || null,
  };
}

function which(name) {
  const probe = process.platform === 'win32' ? ['where', [name]] : ['sh', ['-lc', `command -v ${shellQuote(name)}`]];
  const r = exec(probe[0], probe[1]);
  if (r.code !== 0) return null;
  return r.stdout.split(/\r?\n/).map(s => s.trim()).filter(Boolean)[0] || null;
}

function shellQuote(s) {
  return `'${String(s).replace(/'/g, `'\\''`)}'`;
}

function parseVersion(text) {
  const m = String(text || '').match(/(\d+)\.(\d+)\.(\d+)(?:\.(\d+))?/);
  if (!m) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4] || 0)];
}

function cmpVersion(a, b) {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (a[i] || 0) - (b[i] || 0);
    if (d) return d < 0 ? -1 : 1;
  }
  return 0;
}

function gte(text, min) {
  const v = parseVersion(text);
  return !!v && cmpVersion(v, min) >= 0;
}

function lt(text, max) {
  const v = parseVersion(text);
  return !!v && cmpVersion(v, max) < 0;
}

function homeExpand(p) {
  if (!p) return p;
  if (p === '~') return os.homedir();
  if (p.startsWith('~/')) return path.join(os.homedir(), p.slice(2));
  return p;
}

function findFiles(root, predicate, opts = {}) {
  const maxDepth = opts.maxDepth ?? 7;
  const maxResults = opts.maxResults ?? 20;
  const out = [];
  if (!root || !fs.existsSync(root)) return out;
  const stack = [{ dir: root, depth: 0 }];
  const ignored = new Set(['node_modules', '.git', 'cache', 'downloads']);
  while (stack.length && out.length < maxResults) {
    const { dir, depth } = stack.pop();
    let ents;
    try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { continue; }
    for (const ent of ents) {
      if (out.length >= maxResults) break;
      const p = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        if (depth < maxDepth && !ignored.has(ent.name)) stack.push({ dir: p, depth: depth + 1 });
      } else if (predicate(p, ent.name)) {
        out.push(p);
      }
    }
  }
  return out;
}

function mkdirp(p) { fs.mkdirSync(p, { recursive: true }); }
function writeJson(p, obj) { mkdirp(path.dirname(p)); fs.writeFileSync(p, JSON.stringify(obj, null, 2) + '\n'); }
function readJson(p) { return JSON.parse(fs.readFileSync(p, 'utf8')); }

function copyTree(src, dst) {
  fs.cpSync(src, dst, { recursive: true, force: true });
}

module.exports = {
  exec, which, parseVersion, cmpVersion, gte, lt, homeExpand, findFiles,
  mkdirp, writeJson, readJson, copyTree, shellQuote,
};
