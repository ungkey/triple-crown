#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const crypto = require('crypto');
const os = require('os');

const ICON = {
  done: '✓',
  current: '→',
  waiting: '○',
  blocked: '!',
  advisory: '~',
  skipped: '–',
  unknown: '?',
};

function parseArgs(argv) {
  const out = { mode: 'status', topic: null, phase: null, json: false, compact: false, project: null };
  const rest = [...argv];
  if (rest.length && !rest[0].startsWith('-')) out.mode = rest.shift();
  if (out.mode === 'help' && rest.length && !rest[0].startsWith('-')) out.topic = rest.shift();
  while (rest.length) {
    const a = rest.shift();
    if (a === '--json') out.json = true;
    else if (a === '--compact') out.compact = true;
    else if (a === '--phase') out.phase = rest.shift() || null;
    else if (a.startsWith('--phase=')) out.phase = a.slice(8);
    else if (a === '--project') out.project = rest.shift() || null;
    else if (a.startsWith('--project=')) out.project = a.slice(10);
    else if (!out.phase && /^[0-9]+(?:\.[0-9]+)?$/.test(a)) out.phase = a;
    else throw new Error(`unknown argument: ${a}`);
  }
  return out;
}

function exists(p) {
  try { return fs.existsSync(p); } catch { return false; }
}
function readText(p) {
  try { return fs.readFileSync(p, 'utf8'); } catch { return ''; }
}
function readJson(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; }
}
function findProjectRoot(start) {
  let cur = path.resolve(start || process.cwd());
  while (true) {
    if (exists(path.join(cur, '.planning'))) return cur;
    const parent = path.dirname(cur);
    if (parent === cur) return null;
    cur = parent;
  }
}
function gitRoot(start) {
  try {
    return cp.execFileSync('git', ['rev-parse', '--show-toplevel'], {
      cwd: start || process.cwd(), encoding: 'utf8',
      stdio: ['ignore','pipe','ignore']
    }).trim();
  } catch { return null; }
}
function parseFrontmatter(text) {
  const out = {};
  if (!text.startsWith('---')) return out;
  const end = text.indexOf('\n---', 3);
  if (end < 0) return out;
  const body = text.slice(3, end);
  for (const line of body.split(/\r?\n/)) {
    const m = line.match(/^([A-Za-z0-9_.-]+):\s*(.*?)\s*$/);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g,'');
  }
  return out;
}
function phaseTokenFromState(state) {
  const patterns = [
    /^\s*Current Phase:\s*([0-9]+(?:\.[0-9]+)?)/im,
    /^\s*Active Phase:\s*([0-9]+(?:\.[0-9]+)?)/im,
    /^\s*Phase:\s*([0-9]+(?:\.[0-9]+)?)/im,
    /^\s*current_phase:\s*([0-9]+(?:\.[0-9]+)?)/im,
  ];
  for (const re of patterns) {
    const m = state.match(re);
    if (m) return m[1];
  }
  return null;
}
function normalizeNum(s) {
  const n = Number(String(s));
  return Number.isFinite(n) ? String(n) : String(s);
}
function resolvePhaseDir(root, explicit) {
  const phases = path.join(root, '.planning', 'phases');
  if (!exists(phases)) return { token: explicit || null, dir: null, reason: 'missing .planning/phases' };
  const dirs = fs.readdirSync(phases, { withFileTypes: true })
    .filter(e => e.isDirectory())
    .map(e => e.name)
    .sort();
  let token = explicit;
  if (!token) token = phaseTokenFromState(readText(path.join(root,'.planning','STATE.md')));
  if (!token && dirs.length === 1) token = (dirs[0].match(/^([0-9]+(?:\.[0-9]+)?)/) || [])[1] || null;
  if (!token) return { token: null, dir: null, reason: 'current phase not resolvable' };

  const norm = normalizeNum(token);
  const matches = dirs.filter(name => {
    const m = name.match(/^([0-9]+(?:\.[0-9]+)?)(?:-|$)/);
    return m && normalizeNum(m[1]) === norm;
  });
  if (matches.length === 1) return { token, dir: path.join(phases,matches[0]), name: matches[0] };
  if (matches.length === 0) return { token, dir: null, reason: `no phase directory matches ${token}` };
  return { token, dir: null, reason: `multiple phase directories match ${token}: ${matches.join(', ')}` };
}
function listFiles(dir, re) {
  if (!dir || !exists(dir)) return [];
  return fs.readdirSync(dir).filter(n => re.test(n)).sort();
}
function status(id, label, state, detail, artifact = null, extra = {}) {
  return { id, label, state, detail, artifact, ...extra };
}
function probe(scriptPath, phaseDir) {
  if (!scriptPath || !exists(scriptPath) || !phaseDir) return { available:false, ok:null, output:'probe unavailable' };
  const r = cp.spawnSync(process.execPath, [scriptPath, phaseDir], {
    cwd: phaseDir, encoding:'utf8', timeout:15000, maxBuffer:4*1024*1024
  });
  return {
    available: true,
    ok: r.status === 0,
    code: r.status,
    output: ((r.stdout || '') + (r.stderr || '')).trim()
  };
}
function findGstackChecks(root) {
  if (process.env.CREW_GUIDE_DISABLE_PROBES === '1') return null;
  const candidates = [
    path.join(root,'.gsd','capabilities','crew-quality','checks'),
    path.resolve(__dirname,'..','..','crew-quality','checks'),
    path.join(os.homedir(),'.gsd','capabilities','crew-quality','checks'),
  ];
  return candidates.find(exists) || null;
}
function countUat(text) {
  return {
    issues: (text.match(/^result:\s*issue\s*$/gm) || []).length,
    pending: (text.match(/^result:\s*\[pending\]\s*$/gm) || []).length,
    blocked: (text.match(/^result:\s*blocked\s*$/gm) || []).length,
    passed: (text.match(/^result:\s*pass\s*$/gm) || []).length,
  };
}
function securityOpen(sec) {
  if (!sec || !Array.isArray(sec.findings)) return [];
  const rank = {info:0,low:1,medium:2,high:3,critical:4};
  const th = sec.blockOn || 'high';
  if (th === 'none') return [];
  return sec.findings.filter(f => {
    const st = String(f.status || 'open').toLowerCase();
    if (['resolved','accepted','closed','false_positive','false-positive'].includes(st)) return false;
    return (rank[String(f.severity || 'low').toLowerCase()] ?? 1) >= (rank[th] ?? 3);
  });
}
function digestPlans(phaseDir, files) {
  const h = crypto.createHash('sha256');
  for (const name of files) {
    h.update(Buffer.from(name,'utf8')); h.update(Buffer.from([0]));
    h.update(fs.readFileSync(path.join(phaseDir,name))); h.update(Buffer.from([0]));
  }
  return `sha256:${h.digest('hex')}`;
}
function planReviewState(phaseDir, planFiles, checks) {
  const markerPath = path.join(phaseDir,'GSTACK-PLAN-REVIEW.json');
  const marker = readJson(markerPath);
  if (!planFiles.length) return status('plan','Plan + gstack plan review','current','No PLAN.md exists yet.',null);
  if (!marker) return status('plan','Plan + gstack plan review','blocked','PLAN exists, but the exact plan set has not been marked as reviewed.',markerPath);
  if (marker.status !== 'pass') return status('plan','Plan + gstack plan review','blocked',`Plan review status is ${marker.status || 'unknown'}.`,markerPath);
  try {
    const digest = digestPlans(phaseDir,planFiles);
    if (marker.planDigest !== digest) {
      return status('plan','Plan + gstack plan review','blocked','Plan review marker is stale because the PLAN byte set changed.',markerPath);
    }
  } catch {}
  const pr = checks ? probe(path.join(checks,'plan-review-current.cjs'),phaseDir) : {available:false};
  if (pr.available && !pr.ok) return status('plan','Plan + gstack plan review','blocked',firstLine(pr.output) || 'Plan review gate is not current.',markerPath,{probe:pr});
  return status('plan','Plan + gstack plan review','done',`${planFiles.length} plan file(s); gstack plan review current.`,markerPath);
}
function firstLine(s) {
  return String(s || '').split(/\r?\n/).find(Boolean) || '';
}
function lastModified(paths) {
  const rows = [];
  for (const p of paths) {
    if (!p || !exists(p)) continue;
    try { rows.push({path:p, mtime:fs.statSync(p).mtimeMs}); } catch {}
  }
  rows.sort((a,b)=>b.mtime-a.mtime);
  return rows[0] || null;
}
function rel(root,p) { return p ? path.relative(root,p).replace(/\\/g,'/') : null; }

function buildSnapshot(opts) {
  const start = opts.project ? path.resolve(opts.project) : process.cwd();
  const root = findProjectRoot(start) || findProjectRoot(gitRoot(start) || start);
  if (!root) {
    const git = gitRoot(start);
    return {
      schema:1, projectRoot:null, phase:null,
      overall:'not_initialized',
      stages:[],
      blocker:null,
      next: {
        kind:'gsd',
        command: git ? '/gsd-onboard' : '/gsd-new-project',
        reason: git ? 'Repository exists but .planning is missing.' : 'No GSD project state was found.'
      },
      notes:['Crew guide is read-only; GSD owns project initialization.']
    };
  }

  const phase = resolvePhaseDir(root,opts.phase);
  if (!phase.dir) {
    return {
      schema:1, projectRoot:root, phase,
      overall:'phase_unresolved',
      stages:[],
      blocker: phase.reason,
      next:{kind:'gsd',command:'/gsd-progress',reason:'Let GSD resolve the active/next phase from canonical planning state.'},
      notes:[phase.reason]
    };
  }

  const d = phase.dir;
  const checks = findGstackChecks(root);
  const planFiles = listFiles(d, /(^PLAN\.md$|-PLAN\.md$)/i);
  const summaryFiles = listFiles(d, /(^SUMMARY\.md$|-SUMMARY\.md$)/i);
  const uatFiles = listFiles(d, /-UAT\.md$/i);
  const verFiles = listFiles(d, /-VERIFICATION\.md$/i);

  const reviewPath = path.join(d,'GSTACK-CODE-REVIEW.json');
  const mutationPath = path.join(d,'MUTATION.json');
  const evidencePath = path.join(d,'EVIDENCE.json');
  const qaPath = path.join(d,'GSTACK-QA.json');
  const qaBridgePath = path.join(d,'GSTACK-QA-UAT-BRIDGE.json');
  const secPath = path.join(d,'GSTACK-SECURITY.json');
  const releasePath = path.join(d,'RELEASE.json');
  const canaryPath = path.join(d,'GSTACK-CANARY.json');

  const review = readJson(reviewPath);
  const mutation = readJson(mutationPath);
  const qa = readJson(qaPath);
  const sec = readJson(secPath);
  const release = readJson(releasePath);
  const canary = readJson(canaryPath);
  const verifyProbe = checks ? probe(path.join(checks,'verify-ready.cjs'),d) : {available:false};
  const qaProbe = checks ? probe(path.join(checks,'qa-ready.cjs'),d) : {available:false};
  const secProbe = checks ? probe(path.join(checks,'security-ready.cjs'),d) : {available:false};

  const stages = [];
  stages.push(planReviewState(d,planFiles,checks));

  if (!planFiles.length) {
    stages.push(status('execute','GSD execute','waiting','Waiting for an approved plan.'));
  } else if (!summaryFiles.length) {
    stages.push(status('execute','GSD execute','current','Plan is present; no execution SUMMARY exists yet.'));
  } else if (summaryFiles.length < planFiles.length) {
    stages.push(status('execute','GSD execute','current',`${summaryFiles.length}/${planFiles.length} plan summary artifact(s) present.`));
  } else {
    stages.push(status('execute','GSD execute','done',`${summaryFiles.length} summary artifact(s) present.`));
  }

  if (!review) {
    stages.push(status('review','gstack code review','waiting','No GSTACK-CODE-REVIEW.json yet.',rel(root,reviewPath)));
  } else if (['blocked','unavailable'].includes(review.status)) {
    stages.push(status('review','gstack code review','blocked',`Review status: ${review.status}.`,rel(root,reviewPath)));
  } else if (['pass','concerns'].includes(review.status)) {
    stages.push(status('review','gstack code review','done',
      `Review ${review.status}; mutation=${review.mutated ? 'yes' : 'no'}.`,
      rel(root,reviewPath)));
  } else {
    stages.push(status('review','gstack code review','unknown',`Unknown review status: ${review.status}.`,rel(root,reviewPath)));
  }

  if (!review) {
    stages.push(status('evidence','Mutation/evidence freshness','waiting','Waiting for code review.'));
  } else if (verifyProbe.available) {
    stages.push(status('evidence','Mutation/evidence freshness',verifyProbe.ok?'done':'blocked',
      verifyProbe.ok ? firstLine(verifyProbe.output) : firstLine(verifyProbe.output),
      rel(root,evidencePath),{probe:verifyProbe}));
  } else if (mutation && mutation.changed && !exists(evidencePath)) {
    stages.push(status('evidence','Mutation/evidence freshness','blocked','Review mutated source but EVIDENCE.json is missing.',rel(root,evidencePath)));
  } else {
    stages.push(status('evidence','Mutation/evidence freshness','advisory','Freshness probe unavailable; verify gate remains authoritative.',rel(root,evidencePath)));
  }

  if (!qa) {
    stages.push(status('qa','gstack QA-only','waiting','No GSTACK-QA.json yet.',rel(root,qaPath)));
  } else if (qa.unexpectedMutation) {
    stages.push(status('qa','gstack QA-only','blocked','QA-only mutated project source; report-only invariant violated.',rel(root,qaPath)));
  } else if (['blocked','unavailable'].includes(qa.status)) {
    stages.push(status('qa','gstack QA-only','blocked',`QA status: ${qa.status}.`,rel(root,qaPath)));
  } else if (qaProbe.available && !qaProbe.ok) {
    stages.push(status('qa','gstack QA-only','blocked',firstLine(qaProbe.output),rel(root,qaPath),{probe:qaProbe}));
  } else {
    const issues = Array.isArray(qa.tests) ? qa.tests.filter(t=>t.result==='issue').length : 0;
    stages.push(status('qa','gstack QA-only','done',
      `QA ${qa.status}; ${issues} issue(s) bridged toward GSD UAT.`,
      rel(root,qaPath),{issues}));
  }

  let uat = null, uatCounts = {issues:0,pending:0,blocked:0,passed:0};
  if (uatFiles.length) {
    const up = path.join(d,uatFiles[0]);
    const text = readText(up); uat = {path:up, fm:parseFrontmatter(text), text};
    uatCounts = countUat(text);
  }
  let ver = null;
  if (verFiles.length) {
    const vp = path.join(d,verFiles[0]);
    const text = readText(vp); ver = {path:vp, fm:parseFrontmatter(text), text};
  }

  if (ver && ver.fm.status === 'passed') {
    stages.push(status('verify','GSD verification / UAT','done',
      `Verification passed${uat ? `; UAT issues=${uatCounts.issues}, pending=${uatCounts.pending}` : ''}.`,
      rel(root,ver.path)));
  } else if (ver && ver.fm.status === 'gaps_found') {
    stages.push(status('verify','GSD verification / UAT','blocked','GSD verifier found gaps.',rel(root,ver.path),{uatCounts}));
  } else if (ver && ver.fm.status === 'human_needed') {
    stages.push(status('verify','GSD verification / UAT','current','Automated verification needs human/UAT confirmation.',rel(root,ver.path),{uatCounts}));
  } else if (uat && (uatCounts.issues > 0 || uatCounts.blocked > 0)) {
    stages.push(status('verify','GSD verification / UAT','blocked',
      `UAT has ${uatCounts.issues} issue(s), ${uatCounts.blocked} blocked test(s).`,rel(root,uat.path),{uatCounts}));
  } else if (uat && uatCounts.pending > 0) {
    stages.push(status('verify','GSD verification / UAT','current',
      `${uatCounts.pending} UAT test(s) pending.`,rel(root,uat.path),{uatCounts}));
  } else if (uat) {
    stages.push(status('verify','GSD verification / UAT','current',
      'UAT exists but a passed GSD VERIFICATION artifact was not found.',rel(root,uat.path),{uatCounts}));
  } else {
    stages.push(status('verify','GSD verification / UAT','waiting','No GSD VERIFICATION/UAT artifact yet.'));
  }

  const config = readJson(path.join(root,'.planning','config.json')) || {};
  const securityEnforced =
    (config.workflow && config.workflow.security_enforcement === true) ||
    config['workflow.security_enforcement'] === true;
  const nativeSecurityCandidates = [
    path.join(d,'SECURITY.md'),
    ...listFiles(d, /-SECURITY\.md$/i).map(n=>path.join(d,n))
  ];
  const nativeSecurity = nativeSecurityCandidates.find(exists) || null;
  const openSec = securityOpen(sec);

  if (!sec) {
    stages.push(status('security','Security gates','waiting',
      'No GSTACK-SECURITY.json yet; GSD native security remains independent.',null,{securityEnforced,nativeSecurity:rel(root,nativeSecurity)}));
  } else if (['blocked','unavailable'].includes(sec.status) || openSec.length) {
    stages.push(status('security','Security gates','blocked',
      openSec.length ? `${openSec.length} open gstack CSO finding(s) meet/exceed block threshold.` : `CSO status: ${sec.status}.`,
      rel(root,secPath),{openFindings:openSec.length,securityEnforced,nativeSecurity:rel(root,nativeSecurity)}));
  } else if (secProbe.available && !secProbe.ok) {
    stages.push(status('security','Security gates','blocked',firstLine(secProbe.output),rel(root,secPath),{probe:secProbe}));
  } else if (securityEnforced && !nativeSecurity) {
    stages.push(status('security','Security gates','current',
      'External CSO gate is clear, but native GSD security enforcement is enabled and SECURITY.md was not found.',
      rel(root,secPath),{securityEnforced:true}));
  } else {
    stages.push(status('security','Security gates','done',
      `External CSO status ${sec.status}; blocking findings=0${nativeSecurity ? '; native SECURITY.md present' : ''}.`,
      rel(root,secPath),{securityEnforced,nativeSecurity:rel(root,nativeSecurity)}));
  }

  if (!release) {
    stages.push(status('ship','GSD ship / PR','waiting','No RELEASE.json yet. GSD remains the sole ship/PR owner.',rel(root,releasePath)));
    stages.push(status('deploy','Deployment evidence','waiting','Waiting for a GSD-owned release/PR.'));
    stages.push(status('canary','gstack Canary','waiting','Waiting for matching deployment evidence.'));
  } else {
    const prState = release.pr && release.pr.state || release.releaseState || 'unresolved';
    stages.push(status('ship','GSD ship / PR','done',
      `Release ledger owner=${release.owner || 'unknown'}; PR/release state=${prState}.`,
      rel(root,releasePath),{releaseState:release.releaseState,prState,effectiveReleaseSha:release.effectiveReleaseSha}));

    const dep = release.deployment;
    if (!dep) {
      stages.push(status('deploy','Deployment evidence','current','PR/release exists; deployment evidence has not been recorded.',rel(root,releasePath)));
    } else if (dep.status !== 'deployed') {
      stages.push(status('deploy','Deployment evidence',dep.status === 'failed' ? 'blocked' : 'current',
        `Deployment status=${dep.status}.`,rel(root,releasePath),{deployment:dep}));
    } else if (!dep.matchesRelease) {
      stages.push(status('deploy','Deployment evidence','blocked',
        `Deployed SHA does not match effective release SHA.`,rel(root,releasePath),{deployment:dep}));
    } else {
      stages.push(status('deploy','Deployment evidence','done',
        `Deployment matches release at ${dep.url || '(URL missing)'}.`,rel(root,releasePath),{deployment:dep}));
    }

    if (!canary) {
      stages.push(status('canary','gstack Canary','waiting','No GSTACK-CANARY.json yet.',rel(root,canaryPath)));
    } else if (canary.status === 'pass') {
      stages.push(status('canary','gstack Canary','done',`Canary pass for ${canary.url || 'deployment'}.`,rel(root,canaryPath)));
    } else if (['alert','blocked','unavailable'].includes(canary.status)) {
      stages.push(status('canary','gstack Canary','blocked',`Canary status=${canary.status}.`,rel(root,canaryPath)));
    } else {
      stages.push(status('canary','gstack Canary','unknown',`Canary status=${canary.status}.`,rel(root,canaryPath)));
    }
  }

  const next = determineNext({root,phase,stages,planFiles,summaryFiles,review,qa,uat,uatCounts,ver,sec,release,canary,checks});
  const blockerStage = stages.find(s=>s.state==='blocked') || null;
  const currentStage = blockerStage || stages.find(s=>['current','waiting','unknown'].includes(s.state)) || stages[stages.length-1];

  const artifactPaths = [
    ...planFiles.map(n=>path.join(d,n)),
    path.join(d,'GSTACK-PLAN-REVIEW.json'),
    ...summaryFiles.map(n=>path.join(d,n)),
    reviewPath,mutationPath,evidencePath,qaPath,qaBridgePath,
    ...(uat ? [uat.path] : []), ...(ver ? [ver.path] : []),
    secPath,releasePath,canaryPath
  ].filter(exists);
  const latest = lastModified(artifactPaths);

  return {
    schema:1,
    projectRoot:root,
    phase:{number:phase.token,name:phase.name,dir:rel(root,d)},
    overall: blockerStage ? 'blocked' : (stages.every(s=>s.state==='done') ? 'complete' : 'in_progress'),
    currentStage: currentStage ? currentStage.id : null,
    blocker: blockerStage ? {stage:blockerStage.id,detail:blockerStage.detail} : null,
    progress: {
      done: stages.filter(s=>s.state==='done').length,
      total: stages.length,
      percent: Math.round((stages.filter(s=>s.state==='done').length / Math.max(1,stages.length)) * 100)
    },
    stages,
    next,
    latestArtifact: latest ? {path:rel(root,latest.path),modifiedAt:new Date(latest.mtime).toISOString()} : null,
    gsdNativeProgress:'/gsd-progress',
    notes:[
      'GSD owns lifecycle and phase routing.',
      'Use /gsd-progress for GSD-native project progress; this dashboard adds Crew quality/release checkpoints.'
    ]
  };
}

function byId(stages,id) { return stages.find(s=>s.id===id); }
function determineNext(ctx) {
  const n = ctx.phase.token;
  const stage = id => byId(ctx.stages,id);
  if (stage('plan').state !== 'done') {
    if (!ctx.planFiles.length) return {kind:'gsd',command:'/gsd-progress --next',reason:'No approved phase plan exists yet.',alternatives:[`/gsd-plan-phase ${n}`]};
    return {
      kind:'checkpoint',
      command:'/plan-eng-review',
      reason:'The exact GSD PLAN set must pass interactive gstack plan review before execution.',
      after:[
        `node .gsd/capabilities/crew-quality/checks/mark-plan-reviewed.cjs "${ctx.phase.dir}" --status pass`,
        '/gsd-progress --next'
      ]
    };
  }
  if (stage('execute').state !== 'done') return {kind:'gsd',command:`/gsd-execute-phase ${n}`,reason:'Approved plan has not produced all execution summaries.'};
  if (stage('review').state !== 'done') return {kind:'crew-adapter',command:`/crew-gsd-review ${n}`,reason:'Independent gstack code review is missing or blocked.'};
  if (stage('evidence').state === 'blocked') return {kind:'recovery',command:`/crew-gsd-review ${n}`,reason:'Review/evidence freshness gate is blocked; re-review or record fresh post-review verification before GSD verify.'};
  if (stage('qa').state !== 'done') return {kind:'crew-adapter',command:`/crew-gsd-qa ${n}`,reason:'Report-only browser/functional QA is missing or unusable.'};

  const verify = stage('verify');
  if (verify.state === 'blocked') {
    if ((ctx.uatCounts.issues || 0) > 0 || (ctx.ver && ctx.ver.fm.status === 'gaps_found')) {
      return {kind:'gsd',command:`/gsd-plan-phase ${n} --gaps`,reason:'Canonical GSD verification/UAT contains gaps. GSD owns diagnosis and gap planning.',alternatives:[`/gsd-verify-work ${n}`]};
    }
    return {kind:'gsd',command:`/gsd-verify-work ${n}`,reason:'Verification/UAT is blocked and must be resolved before shipping.'};
  }
  if (verify.state !== 'done') return {kind:'gsd',command:`/gsd-verify-work ${n}`,reason:'GSD goal verification/UAT is not yet passed.'};

  const sec = stage('security');
  if (sec.state === 'blocked') return {kind:'recovery',command:`/crew-gsd-sec ${n}`,reason:'Security gate is blocked. Fix/resolve findings, then re-run external CSO and GSD verification as needed.'};
  if (sec.state !== 'done') return {kind:'crew-adapter',command:`/crew-gsd-sec ${n}`,reason:'External CSO evidence is not current/complete; GSD native security remains independent.'};

  const ship = stage('ship');
  if (ship.state !== 'done') return {kind:'gsd',command:`/gsd-ship ${n}`,reason:'Verification and quality/security checkpoints are clear; GSD owns PR/ship.'};

  const deploy = stage('deploy');
  if (deploy.state === 'blocked') {
    return {kind:'release',command:`/crew-gsd-release ${n}`,reason:'Recorded deployment does not match the effective GSD release. Refresh PR/deployment evidence with the actual deployed SHA.'};
  }
  if (deploy.state !== 'done') {
    return {
      kind:'release',
      command:`/crew-gsd-release ${n}`,
      reason:'The GSD release exists, but matching deployment evidence is still required before Canary.',
      template:`/crew-gsd-release ${n} --deployment-url <url> --deployed-sha <sha> --canary`
    };
  }

  const can = stage('canary');
  if (can.state === 'blocked') {
    return {kind:'incident',command:`/gsd-progress --do "Investigate Canary alert for phase ${n}"`,reason:'Post-deploy Canary reported a problem. Start a GSD-owned investigation/remediation flow.'};
  }
  if (can.state !== 'done') return {kind:'release',command:`/crew-gsd-release ${n} --canary`,reason:'Matching deployment exists; Canary has not passed yet.'};

  return {kind:'gsd',command:'/gsd-progress --next',reason:'Current phase quality/release chain is complete. Let GSD select the next canonical project action.'};
}

const HELP = {
  workflow: [
    'Crew ownership:',
    '  GSD         — project state, planning, scheduling, verification, gaps, ship',
    '  gstack      — product critique and independent review/QA/security/canary',
    '  Superpowers — selected executor disciplines only',
    '',
    'Canonical path:',
    '  Plan → Execute → Review → Evidence → QA → Verify/UAT → Security → Ship → Deploy → Canary',
    '',
    'For GSD-native navigation: /gsd-progress [--next | --do "..."]'
  ],
  plan: [
    'PLAN checkpoint',
    '  GSD creates PLAN.md.',
    '  gstack /plan-eng-review critiques the exact plan set interactively.',
    '  GSTACK-PLAN-REVIEW.json binds approval to the PLAN digest.',
    '  Any later PLAN edit makes that approval stale.'
  ],
  execute: [
    'Execution',
    '  GSD owns plan/task/wave scheduling and executor spawning.',
    '  Superpowers contributes TDD/debug/verification disciplines only.',
    '  Do not start Superpowers brainstorming, writing-plans, SDD, worktree, or ship lifecycles inside GSD execution.'
  ],
  review: [
    'Code review',
    '  gstack /review may mutate source.',
    '  MUTATION.json records the change.',
    '  Pre-review evidence becomes stale when the reviewed workspace changes.',
    '  Fresh post-review verification is required before GSD verification.'
  ],
  qa: [
    'QA',
    '  Crew uses gstack /qa-only, not /qa.',
    '  QA-only is report-only; source mutation is a contract violation.',
    '  Findings are bridged into canonical GSD UAT tests/gaps.'
  ],
  verify: [
    'Verification',
    '  GSD is authoritative for phase goal verification and UAT.',
    '  VERIFICATION status values include passed, gaps_found, human_needed.',
    '  Crew verify:pre gates only check that external review/QA evidence is current.'
  ],
  gaps: [
    'Gap closure',
    '  QA/verification issues must enter canonical GSD UAT/VERIFICATION gaps.',
    '  Continue with /gsd-plan-phase <N> --gaps, then GSD execution/reverification.',
    '  Do not let QA or review create a hidden independent fixer loop.'
  ],
  security: [
    'Security',
    '  GSD native security and gstack CSO are independent layers.',
    '  Either can block ship.',
    '  GSTACK-SECURITY.json is bound to workspace freshness; open findings at/above blockOn stop the external ship gate.'
  ],
  ship: [
    'Ship ownership',
    '  GSD is the sole PR/ship owner.',
    '  The Claude PreToolUse guard blocks unauthorized git push / PR creation / PR merge effects.',
    '  gstack /ship is not part of a GSD-controlled Crew lifecycle.'
  ],
  release: [
    'Release/deployment',
    '  RELEASE.json records GSD PR/release identity and effectiveReleaseSha.',
    '  PR creation is NOT proof of deployment.',
    '  Deployment evidence must include URL + deployed SHA.'
  ],
  canary: [
    'Canary',
    '  Canary is post-deployment observation.',
    '  It runs only when deployment.deployedSha == effectiveReleaseSha.',
    '  Alerts create investigation/remediation work; Canary must not silently patch shipped code.'
  ],
  recovery: [
    'Recovery rule',
    '  Never guess the next lifecycle owner.',
    '  Run /crew-gsd resume to see the last durable checkpoint and blocker.',
    '  Run /gsd-progress --forensic for GSD-native integrity analysis.',
    '  Re-run the owning checkpoint rather than bypassing a stale/missing gate.'
  ],
  e2e: [
    'Compatibility/E2E',
    '  L0 = local/mock contracts',
    '  L1 = real GSD install + render-hooks',
    '  L2 = real Claude Code + gstack + Superpowers semantics',
    '  Full compatibility requires L0 + L1 + L2 PASS.'
  ]
};

function helpText(topic) {
  if (!topic) {
    return [
      'Crew Guide',
      '',
      'Usage:',
      '  /crew-gsd',
      '  /crew-gsd status [--phase N]',
      '  /crew-gsd next [--phase N]',
      '  /crew-gsd resume [--phase N]',
      '  /crew-gsd help <topic>',
      '  /crew-gsd map',
      '  /crew-gsd artifacts',
      '  /crew-gsd doctor',
      '',
      'Topics:',
      '  workflow plan execute review qa verify gaps security ship release canary recovery e2e',
      '',
      'GSD native situational command:',
      '  /gsd-progress [--next | --do "..." | --forensic]'
    ].join('\n');
  }
  const lines = HELP[topic];
  if (!lines) return `Unknown help topic: ${topic}\n\n${helpText(null)}`;
  return lines.join('\n');
}

function mapText() {
  return [
    'Crew Workflow Map',
    '',
    '  GSD PLAN',
    '    ↓',
    '  gstack PLAN REVIEW',
    '    ↓',
    '  GSD EXECUTE + Superpowers discipline',
    '    ↓',
    '  gstack CODE REVIEW',
    '    ↓',
    '  MUTATION / EVIDENCE FRESHNESS',
    '    ↓',
    '  gstack QA-ONLY',
    '    ↓',
    '  GSD VERIFY / UAT / GAP CLOSURE',
    '    ↓',
    '  GSD SECURITY + gstack CSO',
    '    ↓',
    '  GSD SHIP / PR',
    '    ↓',
    '  RELEASE + DEPLOYMENT EVIDENCE',
    '    ↓',
    '  gstack CANARY',
    '',
    'Ownership invariant: one scheduler/orchestrator = GSD.'
  ].join('\n');
}

function artifactText() {
  return [
    'Crew key artifacts',
    '',
    'GSD canonical:',
    '  .planning/STATE.md                 current project/phase state',
    '  <phase>/*-PLAN.md                  approved implementation plans',
    '  <phase>/*-SUMMARY.md               execution summaries',
    '  <phase>/*-VERIFICATION.md          GSD goal verification',
    '  <phase>/*-UAT.md                   canonical user acceptance + gaps',
    '  <phase>/SECURITY.md                GSD native security (when enabled)',
    '',
    'Crew / gstack:',
    '  GSTACK-PLAN-REVIEW.json            exact-plan review digest',
    '  GSTACK-CODE-REVIEW.json            code review result',
    '  MUTATION.json                      post-review mutation state',
    '  EVIDENCE.json                      durable verification evidence',
    '  GSTACK-QA.json                     report-only QA result',
    '  GSTACK-QA-UAT-BRIDGE.json          QA → canonical UAT bridge',
    '  GSTACK-SECURITY.json               independent CSO result',
    '  RELEASE.json                      GSD-owned release/deployment ledger',
    '  GSTACK-CANARY.json                 post-deploy observation result'
  ].join('\n');
}

function doctorSnapshot(opts) {
  const start = opts.project ? path.resolve(opts.project) : process.cwd();
  const root = findProjectRoot(start) || gitRoot(start) || start;
  const checks = [];
  function add(id, ok, detail, severity='required') {
    checks.push({id,status:ok?'PASS':(severity==='optional'?'WARN':'FAIL'),detail});
  }
  add('planning', exists(path.join(root,'.planning','STATE.md')), '.planning/STATE.md');
  add('crew-quality', exists(path.join(root,'.gsd','capabilities','crew-quality','capability.json')), 'project capability staged');
  add('crew-discipline', exists(path.join(root,'.gsd','capabilities','crew-discipline','capability.json')), 'project capability staged');
  add('crew-guide', exists(path.join(root,'.gsd','capabilities','crew-guide','capability.json')) || path.resolve(__dirname,'..').startsWith(root), 'guide capability staged/source');
  add('ship-guard', exists(path.join(root,'.claude','hooks','crew-ship-guard.cjs')), '.claude hook installed', 'optional');
  const fail = checks.filter(c=>c.status==='FAIL').length;
  return {schema:1,projectRoot:root,checks,ready:fail===0};
}

function ownerFor(kind) {
  if (kind === 'gsd') return 'GSD';
  if (kind === 'checkpoint') return 'gstack review checkpoint (GSD plan remains canonical)';
  if (kind === 'crew-adapter') return 'gstack adapter under Crew';
  if (kind === 'release') return 'GSD release evidence + Crew adapter';
  if (kind === 'incident') return 'GSD investigation/remediation';
  if (kind === 'recovery') return 'Owning checkpoint; do not bypass gate';
  return 'See command';
}
function progressBar(progress) {
  if (!progress) return '';
  const width = 10;
  const filled = Math.max(0, Math.min(width, Math.round((progress.percent || 0) / 10)));
  return `[${'#'.repeat(filled)}${'-'.repeat(width-filled)}] ${progress.percent}% (${progress.done}/${progress.total})`;
}

function printStatus(snap, compact=false) {
  const lines = [];
  lines.push('Crew Status');
  lines.push('');
  if (!snap.projectRoot) {
    lines.push('Project: NOT INITIALIZED');
    lines.push(`Next: ${snap.next.command}`);
    lines.push(`Why: ${snap.next.reason}`);
    return lines.join('\n');
  }
  lines.push(`Project: ${snap.projectRoot}`);
  if (snap.phase && snap.phase.number) lines.push(`Phase: ${snap.phase.number}${snap.phase.name ? ` (${snap.phase.name})` : ''}`);
  lines.push(`State: ${String(snap.overall).toUpperCase()}`);
  if (snap.progress) lines.push(`Progress: ${progressBar(snap.progress)}`);
  if (snap.latestArtifact) lines.push(`Latest durable artifact: ${snap.latestArtifact.path}`);
  lines.push('');
  if (!compact) {
    for (const s of snap.stages) {
      lines.push(`${ICON[s.state] || '?'} ${s.label.padEnd(28)} ${s.state.toUpperCase()}`);
      if (s.detail) lines.push(`    ${s.detail}`);
    }
    lines.push('');
  }
  if (snap.blocker) {
    lines.push(`BLOCKER: ${snap.blocker.stage}`);
    lines.push(`  ${snap.blocker.detail}`);
    lines.push('');
  }
  lines.push(`NEXT: ${snap.next.command}`);
  lines.push(`OWNER: ${ownerFor(snap.next.kind)}`);
  lines.push(`WHY:  ${snap.next.reason}`);
  if (snap.next.template) lines.push(`WHEN READY: ${snap.next.template}`);
  if (Array.isArray(snap.next.after)) {
    lines.push('THEN:');
    for (const x of snap.next.after) lines.push(`  ${x}`);
  }
  if (Array.isArray(snap.next.alternatives) && snap.next.alternatives.length) {
    lines.push(`ALTERNATIVE: ${snap.next.alternatives.join(' | ')}`);
  }
  lines.push('');
  lines.push('Help: /crew-gsd help <topic>');
  lines.push('GSD native: /gsd-progress [--next | --do "..." | --forensic]');
  return lines.join('\n');
}

function printNext(snap) {
  return [
    `NEXT: ${snap.next.command}`,
    `OWNER: ${ownerFor(snap.next.kind)}`,
    `WHY: ${snap.next.reason}`,
    snap.next.template ? `WHEN READY: ${snap.next.template}` : null,
    ...(snap.next.after ? ['THEN:', ...snap.next.after.map(x=>`  ${x}`)] : []),
  ].filter(Boolean).join('\n');
}

function printResume(snap) {
  const lines = [
    'Crew Resume Point','',
    `Phase: ${snap.phase && snap.phase.number || 'unknown'}`,
    `Overall: ${snap.overall}`,
    snap.progress ? `Progress: ${progressBar(snap.progress)}` : null,
    `Current checkpoint: ${snap.currentStage || 'unknown'}`,
    `Last durable artifact: ${snap.latestArtifact ? snap.latestArtifact.path : 'none found'}`,
  ];
  if (snap.blocker) lines.push(`Blocker: ${snap.blocker.stage} — ${snap.blocker.detail}`);
  else lines.push('Blocker: none detected');
  lines.push('',`Resume with: ${snap.next.command}`,`Reason: ${snap.next.reason}`);
  if (snap.next.template) lines.push(`When prerequisites exist: ${snap.next.template}`);
  lines.push('','If this looks inconsistent, run: /gsd-progress --forensic');
  return lines.join('\n');
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.mode === 'help') {
    console.log(helpText(opts.topic)); return;
  }
  if (opts.mode === 'map') { console.log(mapText()); return; }
  if (opts.mode === 'artifacts') { console.log(artifactText()); return; }
  if (opts.mode === 'doctor') {
    const d = doctorSnapshot(opts);
    if (opts.json) console.log(JSON.stringify(d,null,2));
    else {
      console.log('Crew Project Doctor\n');
      for (const c of d.checks) console.log(`${c.status.padEnd(4)} ${c.id.padEnd(20)} ${c.detail}`);
      console.log(`\nREADY=${d.ready}`);
    }
    process.exit(d.ready ? 0 : 1);
  }
  if (!['status','next','resume'].includes(opts.mode)) throw new Error(`unknown mode: ${opts.mode}`);
  const snap = buildSnapshot(opts);
  if (opts.json) console.log(JSON.stringify(snap,null,2));
  else if (opts.mode === 'next') console.log(printNext(snap));
  else if (opts.mode === 'resume') console.log(printResume(snap));
  else console.log(printStatus(snap,opts.compact));
}

try { main(); }
catch (err) {
  console.error(`crew-guide: ${err.message}`);
  process.exit(2);
}
