#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path'); const {captureSnapshot}=require('./repo-state-lib.cjs');
const R={info:0,low:1,medium:2,high:3,critical:4};
function fail(c,m){console.error(`Triple Crown security ship gate: ${m}`);process.exit(c);}
try{
 const d=path.resolve(process.argv[2]||''); if(!process.argv[2]) fail(2,'phase directory required');
 const f=path.join(d,'GSTACK-SECURITY.json'); if(!fs.existsSync(f)) fail(3,'GSTACK-SECURITY.json missing');
 const s=JSON.parse(fs.readFileSync(f,'utf8')); if(s.schema!==1||s.runner!=='gstack/cso') fail(4,'invalid security artifact');
 if(s.unexpectedMutation) fail(5,'CSO audit changed repository state unexpectedly');
 if(['blocked','unavailable'].includes(s.status)) fail(6,`security audit status is ${s.status}`);
 const cur=captureSnapshot(d); if(!s.workspace||s.workspace.workspaceDigest!==cur.workspaceDigest) fail(7,`security audit is stale: audited=${s.workspace&&s.workspace.workspaceDigest} current=${cur.workspaceDigest}`);
 const th=s.blockOn||'high'; if(th==='none'){console.log(`Triple Crown security-ready: PASS (${s.status}, advisory only)`);process.exit(0);}
 if(!(th in R)) fail(8,`invalid blockOn threshold: ${th}`);
 const open=(s.findings||[]).filter(x=>{const st=String(x.status||'open').toLowerCase();if(['resolved','accepted','closed','false_positive','false-positive'].includes(st))return false;return (R[String(x.severity||'low').toLowerCase()]??1)>=R[th];});
 if(open.length) fail(9,`${open.length} open CSO finding(s) at/above ${th}: ${open.map(x=>`${x.severity}:${x.title||x.name||x.id||'finding'}`).join('; ')}`);
 console.log(`Triple Crown security-ready: PASS (${s.status}; 0 open findings >= ${th})`);
}catch(e){fail(20,e.message);}
