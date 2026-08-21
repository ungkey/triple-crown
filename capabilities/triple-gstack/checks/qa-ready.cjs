#!/usr/bin/env node
'use strict';
const fs=require('fs'), path=require('path');
const {captureSnapshot,sha256}=require('./lib/repo-state-lib.cjs');
function fail(c,m){console.error(`Triple Crown QA gate: ${m}`);process.exit(c);}
try{
  const phaseDir=path.resolve(process.argv[2]||''); if(!process.argv[2]) fail(2,'phase directory required');
  const qf=path.join(phaseDir,'GSTACK-QA.json'), bf=path.join(phaseDir,'GSTACK-QA-UAT-BRIDGE.json');
  if(!fs.existsSync(qf)) fail(3,'GSTACK-QA.json missing'); if(!fs.existsSync(bf)) fail(4,'GSTACK-QA-UAT-BRIDGE.json missing');
  const qa=JSON.parse(fs.readFileSync(qf,'utf8')), b=JSON.parse(fs.readFileSync(bf,'utf8'));
  if(qa.schema!==1||qa.runner!=='gstack/qa-only') fail(5,'invalid QA artifact');
  if(['blocked','unavailable'].includes(qa.status)) fail(6,`QA status is ${qa.status}`);
  if(!['pass','findings'].includes(qa.status)) fail(7,`unsupported QA status: ${qa.status}`);
  if(qa.unexpectedMutation) fail(8,'qa-only mutated project state; report-only invariant violated');
  const cur=captureSnapshot(phaseDir);
  if(!qa.workspace||qa.workspace.workspaceDigest!==cur.workspaceDigest) fail(9,`QA is stale: tested=${qa.workspace&&qa.workspace.workspaceDigest} current=${cur.workspaceDigest}`);
  if(b.qaArtifactDigest!==sha256(fs.readFileSync(qf))) fail(10,'UAT bridge is stale relative to current QA artifact');
  const uat=path.join(phaseDir,b.uatPath||''); if(!b.uatPath||!fs.existsSync(uat)) fail(11,'bridged GSD UAT file is missing');
  const issues=(qa.tests||[]).filter(t=>t.result==='issue');
  if(b.importedFindingCount!==issues.length) fail(12,`QA issue/UAT gap count mismatch: qa=${issues.length} bridge=${b.importedFindingCount}`);
  console.log(`Triple Crown QA-ready: PASS (${issues.length} QA gap(s) seeded into ${b.uatPath})`);
}catch(e){fail(20,e.message);}
