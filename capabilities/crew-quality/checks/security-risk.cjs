#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path');
const {findProjectRoot,tryGit}=require('./lib/repo-state-lib.cjs');
const RULES=[
{level:'high',re:/\b(auth|authentication|authorization|oauth|oidc|jwt|session|password|passkey|mfa|2fa|rbac|permission|privilege)\b/i,label:'identity/access'},
{level:'high',re:/\b(payment|billing|stripe|paypal|checkout|invoice|refund|wallet|crypto|blockchain|usdt|private key|seed phrase|signing key)\b/i,label:'money/keys'},
{level:'high',re:/\b(secret|credential|api key|kms|encryption key|pii|kyc|ssn|passport|personal data)\b/i,label:'secrets/sensitive-data'},
{level:'high',re:/\b(iam|terraform|cloudformation|kubernetes|k8s|dockerfile|deployment|deploy|ci\/cd|github actions|workflow permission)\b/i,label:'infrastructure/deployment'},
{level:'high',re:/\b(shell|exec|spawn|command injection|sql injection|file upload|deserialization|webhook signature|ssrf|xss|csrf)\b/i,label:'dangerous-boundary'},
{level:'medium',re:/\b(api|webhook|database|migration|schema|admin|role|upload|download|storage|cors|cookie|cache|queue|worker|cron)\b/i,label:'external/state boundary'},
{level:'medium',re:/\b(llm|agent|tool calling|mcp|prompt injection|model output|ai integration)\b/i,label:'AI trust boundary'}];
const R={low:1,medium:2,high:3};
try{
  const phaseDir=path.resolve(process.argv[2]||''); if(!process.argv[2]) throw new Error('phase directory required');
  const names=fs.readdirSync(phaseDir).filter(n=>/\.(md|json|ya?ml)$/i.test(n)).filter(n=>!/^GSTACK-/i.test(n)&&n!=='EVIDENCE.json'&&n!=='MUTATION.json').sort();
  const chunks=[]; for(const n of names){try{chunks.push(`FILE:${n}\n${fs.readFileSync(path.join(phaseDir,n),'utf8')}`)}catch{}}
  const root=findProjectRoot(phaseDir); chunks.push(`GIT_STATUS:\n${tryGit(root,['status','--short'])||''}`);
  const text=chunks.join('\n'); let risk='low', signals=[];
  for(const rule of RULES) if(rule.re.test(text)){signals.push({level:rule.level,label:rule.label}); if(R[rule.level]>R[risk]) risk=rule.level;}
  const seen=new Set(); signals=signals.filter(s=>{const k=`${s.level}:${s.label}`;if(seen.has(k))return false;seen.add(k);return true;});
  console.log(JSON.stringify({schema:1,risk,signals},null,2));
}catch(e){console.error(`security-risk: ${e.message}`);process.exit(1);}
