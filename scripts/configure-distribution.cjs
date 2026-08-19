#!/usr/bin/env node
'use strict';

const fs=require('fs');
const path=require('path');
const ROOT=path.resolve(__dirname,'..');

function parse(argv){
  const out={repo:null,pkg:null};
  for(let i=0;i<argv.length;i++){
    const a=argv[i];
    if(a==='--repo')out.repo=argv[++i];
    else if(a.startsWith('--repo='))out.repo=a.slice(7);
    else if(a==='--package')out.pkg=argv[++i];
    else if(a.startsWith('--package='))out.pkg=a.slice(10);
    else if(a==='--help'||a==='-h'){help();process.exit(0);}
    else throw new Error(`unknown arg: ${a}`);
  }
  return out;
}
function help(){
  console.log(`Configure Triple Crown distribution metadata.

Usage:
  node scripts/configure-distribution.cjs --repo owner/repo --package @scope/name
`);
}
const args=parse(process.argv.slice(2));
if(!args.repo && !args.pkg){help();process.exit(2);}

const pkgPath=path.join(ROOT,'package.json');
const pkg=JSON.parse(fs.readFileSync(pkgPath,'utf8'));
if(args.repo) pkg.repository={type:'git',url:`git+https://github.com/${args.repo}.git`};
if(args.pkg) {
  pkg.name=args.pkg;
  const basename=args.pkg.includes('/') ? args.pkg.split('/').pop() : args.pkg;
  pkg.bin=pkg.bin || {};
  pkg.bin[basename]='bin/triple-crown.cjs';
}
fs.writeFileSync(pkgPath,JSON.stringify(pkg,null,2)+'\n');

if(args.pkg){
  for(const rel of ['install.sh','install.ps1','docs/INSTALLER.md','README.md']){
    const p=path.join(ROOT,rel);
    if(!fs.existsSync(p))continue;
    let s=fs.readFileSync(p,'utf8');
    s=s.replace(/triple-crown-workflow-installer/g,args.pkg);
    fs.writeFileSync(p,s);
  }
}
if(args.repo){
  for(const rel of ['docs/INSTALLER.md','README.md']){
    const p=path.join(ROOT,rel);
    if(!fs.existsSync(p))continue;
    let s=fs.readFileSync(p,'utf8');
    s=s.replace(/REPLACE_WITH_OWNER\/triple-crown-workflow/g,args.repo);
    fs.writeFileSync(p,s);
  }
}
console.log(`Configured package=${pkg.name}`);
console.log(`Configured repo=${args.repo || '(unchanged)'}`);
