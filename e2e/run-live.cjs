#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const cp = require('child_process');
const {
  exec, which, mkdirp, copyTree, writeJson, readJson
} = require('./lib/common.cjs');

const ROOT = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const mock = args.includes('--mock');
const keep = args.includes('--keep');
const outArg = (() => {
  const i = args.indexOf('--output');
  return i >= 0 ? args[i+1] : null;
})();

function log(msg) { console.log(`[crew-e2e] ${msg}`); }
function fatal(stage, msg, extra = {}) {
  const err = new Error(msg);
  err.stage = stage;
  Object.assign(err, extra);
  throw err;
}
function runOrFail(stage, cmd, argv, cwd, env = process.env) {
  const r = exec(cmd, argv, { cwd, env, timeout: 120000 });
  if (r.code !== 0) fatal(stage, `${cmd} ${argv.join(' ')} failed`, { stdout:r.stdout, stderr:r.stderr, code:r.code });
  return r;
}
function resolveGsd() {
  if (mock) return path.join(__dirname, 'mock-gsd.cjs');
  if (process.env.CREW_GSD_BIN) return process.env.CREW_GSD_BIN;
  const p = which('gsd');
  if (!p) fatal('doctor','gsd command not found; set CREW_GSD_BIN if needed');
  return p;
}
function runGsd(stage, gsd, argv, cwd, env = process.env) {
  if (mock) {
    return runOrFail(stage, process.execPath, [gsd, ...argv], cwd, env);
  }
  return runOrFail(stage, gsd, argv, cwd, env);
}
function makeFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'crew-v06-live-'));
  copyTree(path.join(ROOT,'fixtures','demo-app'), root);
  mkdirp(path.join(root,'.planning','phases'));
  copyTree(path.join(ROOT,'fixtures','planning'), path.join(root,'.planning'));
  mkdirp(path.join(root,'capabilities'));
  copyTree(path.join(ROOT,'capabilities','crew-quality'), path.join(root,'capabilities','crew-quality'));
  copyTree(path.join(ROOT,'capabilities','crew-discipline'), path.join(root,'capabilities','crew-discipline'));
  copyTree(path.join(ROOT,'capabilities','crew-guide'), path.join(root,'capabilities','crew-guide'));

  runOrFail('fixture-git','git',['init','-q'],root);
  runOrFail('fixture-git','git',['config','user.email','crew-e2e@example.invalid'],root);
  runOrFail('fixture-git','git',['config','user.name','Crew E2E'],root);
  runOrFail('fixture-git','git',['checkout','-qb','phase/01-auth'],root);
  runOrFail('fixture-git','git',['add','.'],root);
  runOrFail('fixture-git','git',['commit','-qm','fixture baseline'],root);
  return root;
}

function parseJsonOutput(stage, text) {
  try { return JSON.parse(text); }
  catch (e) { fatal(stage, `invalid JSON output: ${e.message}`, { output:text }); }
}

const result = {
  schema: 1,
  mode: mock ? 'mock' : 'live',
  startedAt: new Date().toISOString(),
  stages: [],
};

let fixture = null;
try {
  // Doctor first.
  const doctorEnv = {...process.env};
  if (mock) doctorEnv.CREW_GSD_BIN = path.join(__dirname,'mock-gsd.cjs');
  const doctorArgs = ['--json'];
  if (mock) doctorArgs.push('--mock');
  const doctor = exec('node',[path.join(__dirname,'doctor.cjs'),...doctorArgs],{cwd:ROOT,env:doctorEnv,timeout:30000});
  const doctorJson = parseJsonOutput('doctor', doctor.stdout || '{}');
  result.stages.push({stage:'doctor',status:doctor.code===0?'PASS':'FAIL',report:doctorJson});
  if (doctor.code !== 0) fatal('doctor','environment doctor failed',{doctor:doctorJson});

  fixture = makeFixture();
  result.fixture = fixture;
  log(`fixture: ${fixture}`);

  const gsd = resolveGsd();
  const env = {...process.env, CREW_GSD_BIN:gsd};

  // Initialize actual GSD project.
  const init = runGsd('gsd-init',gsd,['init'],fixture,env);
  result.stages.push({stage:'gsd-init',status:'PASS',stdout:init.stdout.trim()});

  // Install capabilities. --yes is required for non-interactive executable-surface consent.
  for (const id of ['crew-discipline','crew-quality','crew-guide']) {
    const r = runGsd(
      `install-${id}`, gsd,
      ['capability','install',`./capabilities/${id}`,'--scope','project','--yes'],
      fixture, env
    );
    result.stages.push({stage:`install-${id}`,status:'PASS',stdout:r.stdout.trim()});
  }

  const list = runGsd('capability-list',gsd,['capability','list','--scope','project'],fixture,env);
  const listJson = parseJsonOutput('capability-list', list.stdout);
  for (const id of ['crew-discipline','crew-quality','crew-guide']) {
    const row = listJson.find(x => x.id === id);
    if (!row) fatal('capability-list',`${id} missing from capability list`);
    if (row.status !== 'active') fatal('capability-list',`${id} status=${row.status}; expected active`,{row});
  }
  result.stages.push({stage:'capability-list',status:'PASS',capabilities:listJson.filter(x=>['crew-discipline','crew-quality','crew-guide'].includes(x.id))});

  // Staged bundles must exist in project scope.
  for (const id of ['crew-discipline','crew-quality','crew-guide']) {
    const staged = path.join(fixture,'.gsd','capabilities',id,'capability.json');
    if (!fs.existsSync(staged)) fatal('staging',`missing staged bundle: ${staged}`);
  }
  result.stages.push({stage:'staging',status:'PASS'});

  // Read-only workflow guide must orient the fixture before any lifecycle work.
  const guideScript = path.join(
    fixture,'.gsd','capabilities','crew-guide','checks','workflow-guide.cjs'
  );
  const guide = runOrFail('workflow-guide','node',[guideScript,'status','--json'],fixture,env);
  const guideJson = parseJsonOutput('workflow-guide',guide.stdout);
  if (!guideJson.next || !guideJson.next.command) {
    fatal('workflow-guide','guide did not produce a next command',{guide:guideJson});
  }
  result.stages.push({
    stage:'workflow-guide',
    status:'PASS',
    currentStage:guideJson.currentStage,
    blocker:guideJson.blocker,
    next:guideJson.next
  });

  // Render and persist hook graph.
  const renderDir = path.join(fixture,'.crew-e2e','hooks');
  mkdirp(renderDir);
  const points = [
    ['plan:post','plan-post.json'],
    ['execute:wave:pre','execute-wave-pre.json'],
    ['execute:post','execute-post.json'],
    ['verify:pre','verify-pre.json'],
    ['ship:pre','ship-pre.json'],
    ['ship:post','ship-post.json'],
  ];
  for (const [point,file] of points) {
    const r = runGsd(`render-${point}`,gsd,['loop','render-hooks',point,'--raw'],fixture,env);
    parseJsonOutput(`render-${point}`,r.stdout);
    fs.writeFileSync(path.join(renderDir,file),r.stdout);
  }
  const assertHooks = runOrFail('assert-hooks','node',[path.join(__dirname,'assert-hooks.cjs'),renderDir],fixture,env);
  result.stages.push({stage:'hook-contract',status:'PASS',stdout:assertHooks.stdout.trim()});

  // Install hard ship guard into fixture project and verify settings merge.
  const guardInstall = runOrFail(
    'ship-guard-install','node',[path.join(ROOT,'scripts','install-claude-ship-guard.cjs'),fixture],fixture,env
  );
  const settingsPath = path.join(fixture,'.claude','settings.json');
  const settings = readJson(settingsPath);
  if (!settings.hooks || !Array.isArray(settings.hooks.PreToolUse)) fatal('ship-guard-install','PreToolUse hook missing after install');
  result.stages.push({stage:'ship-guard-install',status:'PASS',stdout:guardInstall.stdout.trim()});

  // Run the local executable contract suite against v0.6 scripts.
  const py = which('python3') || which('python');
  if (py) {
    const smoke = runOrFail('adapter-contracts',py,[path.join(ROOT,'tests','run_local_smoke.py')],ROOT,env);
    result.stages.push({stage:'adapter-contracts',status:'PASS',stdout:smoke.stdout.trim()});
  } else {
    result.stages.push({stage:'adapter-contracts',status:'WARN',message:'Python not found; skipped local contract suite'});
  }

  result.status = 'PASS';
} catch (err) {
  result.status = 'FAIL';
  result.failure = {
    stage: err.stage || 'unknown',
    message: err.message,
    stdout: err.stdout || null,
    stderr: err.stderr || null,
    code: err.code ?? null,
    doctor: err.doctor || null,
    row: err.row || null,
  };
} finally {
  result.finishedAt = new Date().toISOString();
  const output = outArg ? path.resolve(outArg) : path.join(ROOT,'e2e','E2E-RESULT.json');
  writeJson(output,result);
  log(`result: ${output}`);
  if (fixture && !keep) {
    try { fs.rmSync(fixture,{recursive:true,force:true}); } catch {}
  } else if (fixture) {
    log(`kept fixture: ${fixture}`);
  }
}

if (result.status !== 'PASS') {
  console.error(JSON.stringify(result.failure,null,2));
  process.exit(1);
}
console.log('PASS Crew v0.6 install/render/staging/guard contract');
