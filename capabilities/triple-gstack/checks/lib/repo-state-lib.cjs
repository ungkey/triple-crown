'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const cp = require('child_process');

const EXCLUDED_PREFIXES = ['.planning/', '.gsd/'];

function sha256(data) {
  return `sha256:${crypto.createHash('sha256').update(data).digest('hex')}`;
}

function isExcluded(rel) {
  const p = String(rel || '').replace(/\\/g, '/').replace(/^\.\//, '');
  return p === '.planning' || p === '.gsd' ||
    EXCLUDED_PREFIXES.some((prefix) => p.startsWith(prefix));
}

function execGit(root, args, options = {}) {
  return cp.execFileSync('git', args, {
    cwd: root,
    encoding: options.encoding === null ? null : (options.encoding || 'utf8'),
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 64 * 1024 * 1024,
  });
}

function tryGit(root, args, options = {}) {
  try {
    return execGit(root, args, options);
  } catch {
    return null;
  }
}

function findProjectRoot(start) {
  let cur = path.resolve(start || process.cwd());
  const gitRoot = tryGit(cur, ['rev-parse', '--show-toplevel']);
  if (gitRoot) return gitRoot.trim();

  while (true) {
    if (fs.existsSync(path.join(cur, '.planning'))) return cur;
    const parent = path.dirname(cur);
    if (parent === cur) break;
    cur = parent;
  }
  throw new Error(`could not resolve project root from ${start || process.cwd()}`);
}

function gitPathspecArgs() {
  return ['--', '.', ':(exclude).planning/**', ':(exclude).gsd/**'];
}

function splitZ(bufOrString) {
  const s = Buffer.isBuffer(bufOrString) ? bufOrString.toString('utf8') : String(bufOrString || '');
  return s.split('\0').filter(Boolean);
}

function fileContentDigest(root, rel) {
  const abs = path.join(root, rel);
  try {
    const st = fs.lstatSync(abs);
    if (st.isSymbolicLink()) return sha256(Buffer.from(`symlink:${fs.readlinkSync(abs)}`));
    if (st.isFile()) return sha256(fs.readFileSync(abs));
    if (st.isDirectory()) return sha256(Buffer.from('directory'));
    return sha256(Buffer.from(`special:${st.mode}`));
  } catch (err) {
    if (err && err.code === 'ENOENT') return null;
    throw err;
  }
}

function listDirtyFiles(root) {
  const tracked = splitZ(
    execGit(root, ['diff', '--name-only', '-z', 'HEAD', ...gitPathspecArgs()], { encoding: null })
  );
  const untracked = splitZ(
    execGit(root, ['ls-files', '--others', '--exclude-standard', '-z'], { encoding: null })
  ).filter((p) => !isExcluded(p));

  return [...new Set([...tracked, ...untracked].filter((p) => !isExcluded(p)))].sort();
}

function hashGitPatch(root, args) {
  const out = execGit(root, args, { encoding: null });
  return sha256(out);
}

function captureSnapshot(start) {
  const root = findProjectRoot(start);
  const head = execGit(root, ['rev-parse', 'HEAD']).trim();
  const branch = (tryGit(root, ['branch', '--show-current']) || '').trim() || null;

  const indexDigest = hashGitPatch(root, ['diff', '--cached', '--binary', 'HEAD', ...gitPathspecArgs()]);
  const worktreeDigest = hashGitPatch(root, ['diff', '--binary', ...gitPathspecArgs()]);
  const dirtyFiles = listDirtyFiles(root);
  const fileDigests = {};
  for (const rel of dirtyFiles) fileDigests[rel] = fileContentDigest(root, rel);

  const untrackedFiles = splitZ(
    execGit(root, ['ls-files', '--others', '--exclude-standard', '-z'], { encoding: null })
  ).filter((p) => !isExcluded(p)).sort();
  const untrackedDigests = {};
  for (const rel of untrackedFiles) untrackedDigests[rel] = fileContentDigest(root, rel);

  const canonical = JSON.stringify({
    head,
    branch,
    indexDigest,
    worktreeDigest,
    fileDigests,
    untrackedDigests,
  });

  return {
    schema: 1,
    capturedAt: new Date().toISOString(),
    projectRoot: root,
    head,
    branch,
    indexDigest,
    worktreeDigest,
    dirtyFiles,
    fileDigests,
    untrackedFiles,
    untrackedDigests,
    workspaceDigest: sha256(Buffer.from(canonical)),
  };
}

function diffSnapshotFiles(pre, post) {
  const files = new Set();
  const preMap = pre.fileDigests || {};
  const postMap = post.fileDigests || {};
  for (const key of new Set([...Object.keys(preMap), ...Object.keys(postMap)])) {
    if (preMap[key] !== postMap[key]) files.add(key);
  }

  if (pre.head && post.head && pre.head !== post.head) {
    try {
      const root = post.projectRoot || pre.projectRoot;
      const committed = splitZ(
        execGit(root, ['diff', '--name-only', '-z', pre.head, post.head, ...gitPathspecArgs()], { encoding: null })
      );
      for (const p of committed) if (!isExcluded(p)) files.add(p);
    } catch {
      // Non-linear/re-written history: the digest still detects mutation.
    }
  }

  if (
    files.size === 0 &&
    (pre.indexDigest !== post.indexDigest || pre.worktreeDigest !== post.worktreeDigest)
  ) {
    files.add('(git-index/worktree-state)');
  }

  return [...files].sort();
}

function commitsBetween(pre, post) {
  if (!pre.head || !post.head || pre.head === post.head) return [];
  const root = post.projectRoot || pre.projectRoot;
  try {
    return execGit(root, ['rev-list', '--reverse', `${pre.head}..${post.head}`])
      .split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
  } catch {
    return [post.head];
  }
}

function compareSnapshots(pre, post) {
  const changed = pre.workspaceDigest !== post.workspaceDigest;
  return {
    changed,
    changedFiles: changed ? diffSnapshotFiles(pre, post) : [],
    commits: changed ? commitsBetween(pre, post) : [],
    headChanged: pre.head !== post.head,
    preWorkspaceDigest: pre.workspaceDigest,
    postWorkspaceDigest: post.workspaceDigest,
  };
}

module.exports = {
  sha256,
  isExcluded,
  execGit,
  tryGit,
  findProjectRoot,
  captureSnapshot,
  compareSnapshots,
  fileContentDigest,
};
