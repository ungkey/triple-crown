#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path');
const {captureSnapshot,compareSnapshots,sha256}=require('./lib/repo-state-lib.cjs');
function sd(p){const d=path.join(path.resolve(p),'.triple-crown');fs.mkdirSync(d,{recursive:true});return d;}
function pre(p){return path.join(sd(p),'gstack-cso-pre.json');}
try{
 const [cmd,arg,norm]=process.argv.slice(2); if(!cmd||!arg) throw new Error('usage: security-session.cjs <begin|finalize> <phaseDir> [normalized.json]');
 const phaseDir=path.resolve(arg);
 if(cmd==='begin'){
   const d={schema:1,runner:'gstack/cso',startedAt:new Date().toISOString(),snapshot:captureSnapshot(phaseDir)};
   fs.writeFileSync(pre(phaseDir),JSON.stringify(d,null,2)+'\n'); console.log(JSON.stringify(d,null,2)); process.exit(0);
 }
 if(cmd!=='finalize'||!norm) throw new Error('normalized security file required');
 const p=JSON.parse(fs.readFileSync(pre(phaseDir),'utf8')), n=JSON.parse(fs.readFileSync(path.resolve(norm),'utf8'));
 const allowed=['pass','findings','blocked','unavailable','not_applicable','off']; if(n.schema!==1||!allowed.includes(n.status)) throw new Error('invalid normalized security artifact');
 const post=captureSnapshot(phaseDir), cmp=compareSnapshots(p.snapshot,post); let status=cmp.changed?'blocked':n.status;
 const out={schema:1,runner:'gstack/cso',status,startedAt:p.startedAt,finishedAt:new Date().toISOString(),
   mode:n.mode||'risk-based',auditDepth:n.auditDepth||null,risk:n.risk||'low',riskSignals:Array.isArray(n.riskSignals)?n.riskSignals:[],
   blockOn:n.blockOn||'high',summary:n.summary||null,findings:Array.isArray(n.findings)?n.findings:[],unexpectedMutation:cmp.changed,
   mutation:{changed:cmp.changed,changedFiles:cmp.changedFiles,commits:cmp.commits},
   workspace:{head:post.head,workspaceDigest:post.workspaceDigest}};
 out.artifactDigest=sha256(Buffer.from(JSON.stringify(out)));
 fs.writeFileSync(path.join(phaseDir,'GSTACK-SECURITY.json'),JSON.stringify(out,null,2)+'\n');
 const lines=['# gstack CSO Security Audit','',`- Status: **${status.toUpperCase()}**`,`- Mode: ${out.mode}`,`- Audit depth: ${out.auditDepth||'n/a'}`,
 `- Deterministic phase risk: **${out.risk.toUpperCase()}**`,`- Ship block threshold: **${out.blockOn.toUpperCase()}**`,
 `- Workspace digest: \`${out.workspace.workspaceDigest}\``,`- Unexpected repository mutation: **${out.unexpectedMutation?'YES':'NO'}**`,
 `- Findings: ${out.findings.length}`,'','## Summary','',out.summary||'_No normalized summary supplied._',''];
 if(out.findings.length){lines.push('## Findings','');for(const f of out.findings){lines.push(`- **${String(f.severity||'low').toUpperCase()}** ${f.title||f.name||f.id||'Security finding'} — ${f.status||'open'}`);if(f.description)lines.push(`  - ${f.description}`);if(f.remediation)lines.push(`  - Remediation: ${f.remediation}`);}lines.push('');}
 fs.writeFileSync(path.join(phaseDir,'GSTACK-SECURITY.md'),lines.join('\n')); console.log(JSON.stringify(out,null,2));
}catch(e){console.error(`security-session: ${e.message}`);process.exit(1);}
