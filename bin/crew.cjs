#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const cp = require('child_process');
const readline = require('readline');
const crypto = require('crypto');

const PACKAGE_ROOT = path.resolve(__dirname, '..');
const VERSION = fs.readFileSync(path.join(PACKAGE_ROOT, 'VERSION'), 'utf8').trim();
const CAPABILITIES = ['crew-discipline', 'crew-quality', 'crew-ship', 'crew-guide'];
const ROUTING_START = '<!-- crew:managed-routing:start -->';
const ROUTING_END = '<!-- crew:managed-routing:end -->';

// Claude Code discovers skills by directory name under `<project>/.claude/skills`.
// Since M1a, skill stems are self-describing (`crew-*`) and carry no separate
// installer prefix: the installed directory name equals the source stem equals
// the bundled SKILL.md's frontmatter `name`. e2e/contract/skill-contract.test.cjs
// pins that invariant, including that this prefix stays empty.
const SKILL_PREFIX = '';
// Ownership marker written next to every skill this installer manages. Uninstall
// removes exactly the marked directories, so a hand-authored gsd-* skill in the
// same directory is never touched.
const SKILL_MARKER = '.crew-skill';

function log(msg='') { process.stdout.write(String(msg) + '\n'); }
function warn(msg) { process.stderr.write(`WARN: ${msg}\n`); }
function fail(msg, code=1) {
  const e = new Error(msg);
  e.exitCode = code;
  throw e;
}
function spawn(cmd, args=[], opts={}) {
  const r = cp.spawnSync(cmd, args, {
    cwd: opts.cwd || process.cwd(),
    env: opts.env || process.env,
    encoding: 'utf8',
    input: opts.input,
    stdio: opts.inherit ? 'inherit' : ['ignore','pipe','pipe'],
    timeout: opts.timeout || 180000,
    maxBuffer: 32 * 1024 * 1024,
  });
  return {
    code: r.status == null ? 1 : r.status,
    stdout: r.stdout || '',
    stderr: r.stderr || '',
    error: r.error || null,
  };
}
function run(cmd,args,opts={}) {
  const r=spawn(cmd,args,opts);
  if (r.code!==0) {
    const tail=[r.stdout,r.stderr].filter(Boolean).join('\n').trim();
    let extra='';
    if(/runtimeCompat\.(supported|notes) references unknown runtime/i.test(tail)) {
      extra='\nCrew hint: this is a GSD concrete-runtime cross-capability validation failure. v0.6.3+ bundles use runtimeCompat ["*"] specifically to avoid this coupling.';
    }
    fail(`${cmd} ${args.join(' ')} failed${tail ? `\n${tail}` : ''}${extra}`, r.code || 1);
  }
  return r;
}
function commandPath(name) {
  const r = process.platform === 'win32'
    ? spawn('where',[name],{timeout:10000})
    : spawn('sh',['-lc',`command -v ${shellQuote(name)}`],{timeout:10000});
  if (r.code!==0) return null;
  return r.stdout.split(/\r?\n/).map(x=>x.trim()).filter(Boolean)[0] || null;
}
function shellQuote(s) { return `'${String(s).replace(/'/g, `'\\''`)}'`; }
function versionTuple(v) {
  const m=String(v||'').match(/(\d+)\.(\d+)\.(\d+)/);
  return m ? [Number(m[1]),Number(m[2]),Number(m[3])] : null;
}
function gte(v,min) {
  const a=versionTuple(v); if(!a)return false;
  for(let i=0;i<3;i++){if(a[i]>min[i])return true;if(a[i]<min[i])return false;}
  return true;
}
function sameRealPath(a,b) {
  try { return fs.realpathSync(a)===fs.realpathSync(b); }
  catch { return path.resolve(a)===path.resolve(b); }
}
function exists(p) { try{return fs.existsSync(p);}catch{return false;} }
function mkdirp(p) { fs.mkdirSync(p,{recursive:true}); }
function readJson(p) { try{return JSON.parse(fs.readFileSync(p,'utf8'));}catch{return null;} }
function writeJson(p,v) { mkdirp(path.dirname(p)); fs.writeFileSync(p,JSON.stringify(v,null,2)+'\n'); }
function copy(src,dst) { fs.cpSync(src,dst,{recursive:true,force:true}); }

function parse(argv) {
  const out={
    command:'install', project:null, yes:false, bootstrap:true,
    routing:true, shipGuard:true, dryRun:false, strict:false, json:false,
    verbose:false, allowPrerelease:false,
    global:false, from:null, fromGlobal:null, skipBackupCheck:false
  };
  const rest=[...argv];
  if(rest.length && !rest[0].startsWith('-')) out.command=rest.shift();
  while(rest.length) {
    const a=rest.shift();
    if(a==='--project') out.project=rest.shift()||fail('--project requires a path',2);
    else if(a.startsWith('--project=')) out.project=a.slice(10);
    else if(a==='--yes'||a==='-y') out.yes=true;
    else if(a==='--bootstrap') out.bootstrap=true;
    else if(a==='--no-bootstrap') out.bootstrap=false;
    else if(a==='--no-routing') out.routing=false;
    else if(a==='--no-ship-guard') out.shipGuard=false;
    else if(a==='--dry-run') out.dryRun=true;
    else if(a==='--strict') out.strict=true;
    else if(a==='--json') out.json=true;
    else if(a==='--verbose'||a==='-v') out.verbose=true;
    else if(a==='--allow-prerelease') out.allowPrerelease=true;
    else if(a==='--global') out.global=true;
    else if(a==='--from') out.from=rest.shift()||fail('--from requires a path',2);
    else if(a==='--from-global') out.fromGlobal=rest.shift()||fail('--from-global requires a path',2);
    else if(a==='--skip-backup-check') out.skipBackupCheck=true;
    else if(a==='--help'||a==='-h') out.command='help';
    else fail(`unknown option: ${a}`,2);
  }
  return out;
}
function projectRoot(input) {
  if(input) return path.resolve(input);
  const git=spawn('git',['rev-parse','--show-toplevel'],{cwd:process.cwd(),timeout:10000});
  if(git.code===0 && git.stdout.trim()) return path.resolve(git.stdout.trim());
  return process.cwd();
}
function runnerFromPath(p) {
  if(!p) return null;
  if(/\.(cjs|js|mjs)$/i.test(p)) return {cmd:process.execPath,prefix:[p],display:`node ${p}`};
  return {cmd:p,prefix:[],display:p};
}
function resolveGsd(root) {
  if(process.env.CREW_GSD_BIN) {
    const p=path.resolve(process.env.CREW_GSD_BIN);
    if(exists(p)) return runnerFromPath(p);
  }
  for(const name of ['gsd','gsd-tools']) {
    const p=commandPath(name);
    if(p) return runnerFromPath(p);
  }
  const candidates=[
    path.join(root,'.claude','gsd-core','bin','gsd-tools.cjs'),
    path.join(os.homedir(),'.claude','gsd-core','bin','gsd-tools.cjs'),
    path.join(os.homedir(),'.config','claude','gsd-core','bin','gsd-tools.cjs'),
  ];
  for(const p of candidates) if(exists(p)) return runnerFromPath(p);
  return null;
}
function gsdExec(runner,args,root,opts={}) {
  if(!runner) fail('GSD capability CLI is unavailable.');
  if(opts.verbose) log(`$ ${runner.display} ${args.join(' ')}`);
  return run(runner.cmd,[...runner.prefix,...args],{cwd:root,inherit:opts.inherit,timeout:240000});
}
function gsdTry(runner,args,root) {
  if(!runner) return {code:127,stdout:'',stderr:'GSD unavailable'};
  return spawn(runner.cmd,[...runner.prefix,...args],{cwd:root,timeout:120000});
}
function detectGstack() {
  const source=process.env.CREW_GSTACK_HOME
    ? path.resolve(process.env.CREW_GSTACK_HOME)
    : path.join(os.homedir(),'.claude','skills','gstack');
  const short=path.join(os.homedir(),'.claude','skills','review','SKILL.md');
  const prefixed=path.join(os.homedir(),'.claude','skills','gstack-review','SKILL.md');
  return {
    source,
    sourcePresent:exists(path.join(source,'setup')) && exists(path.join(source,'review','SKILL.md')),
    shortSkills:exists(short),
    prefixedSkills:exists(prefixed),
  };
}
function findSuperpowers() {
  const explicit=process.env.CREW_SUPERPOWERS_HOME;
  if(explicit && exists(path.join(explicit,'using-superpowers','SKILL.md'))) return explicit;
  const roots=[
    path.join(os.homedir(),'.claude','skills'),
    path.join(os.homedir(),'.claude','plugins'),
    path.join(os.homedir(),'.config','claude','plugins'),
  ];
  const maxDepth=8;
  for(const root of roots) {
    if(!exists(root)) continue;
    const stack=[{p:root,d:0}];
    while(stack.length) {
      const {p,d}=stack.pop();
      let ents=[]; try{ents=fs.readdirSync(p,{withFileTypes:true});}catch{continue;}
      for(const e of ents) {
        if(!e.isDirectory()) continue;
        const q=path.join(p,e.name);
        if(e.name==='using-superpowers' && exists(path.join(q,'SKILL.md'))) return path.dirname(q);
        if(d<maxDepth && !['node_modules','.git'].includes(e.name)) stack.push({p:q,d:d+1});
      }
    }
  }
  return null;
}
function bootstrapGsd(root, opts) {
  const nodeV=process.version.replace(/^v/,'');
  if(!gte(nodeV,[24,0,0])) {
    fail(`GSD 1.10 requires Node >=24. Current Node is ${nodeV}. Upgrade Node first, then re-run the installer.`);
  }
  const npx=commandPath(process.platform==='win32'?'npx.cmd':'npx') || commandPath('npx');
  if(!npx) fail('npx is required to bootstrap GSD but was not found.');
  log('Installing GSD for Claude Code...');
  run(npx,['--yes','@opengsd/gsd-core@latest','--claude','--global'],{cwd:root,inherit:true,timeout:600000});
}
function bootstrapGstack(opts) {
  const git=commandPath('git'); if(!git) fail('git is required to install gstack.');
  const bash=commandPath('bash'); if(!bash) fail('bash is required to run gstack setup.');
  const bun=commandPath(process.platform==='win32'?'bun.exe':'bun') || commandPath('bun');
  if(!bun) {
    fail('gstack setup requires Bun. Install Bun, then re-run this installer.');
  }
  const target=path.join(os.homedir(),'.claude','skills','gstack');
  if(!exists(target)) {
    mkdirp(path.dirname(target));
    log(`Cloning gstack into ${target}...`);
    run(git,['clone','--single-branch','--depth','1','https://github.com/garrytan/gstack.git',target],
      {inherit:true,timeout:600000});
  }
  log('Running gstack setup with short skill names (/review, /qa-only, /cso)...');
  run(bash,[path.join(target,'setup'),'--host','claude','--no-prefix'],{cwd:target,inherit:true,timeout:600000});
}
async function consent(opts, actions) {
  if(opts.yes) return true;
  if(!process.stdin.isTTY || !process.stdout.isTTY) {
    fail(`Non-interactive install requires --yes.\nPlanned actions:\n${actions.map(x=>`  - ${x}`).join('\n')}`);
  }
  log('Crew will perform:');
  for(const a of actions) log(`  - ${a}`);
  const rl=readline.createInterface({input:process.stdin,output:process.stdout});
  const ans=await new Promise(resolve=>rl.question('Continue? [y/N] ',x=>{rl.close();resolve(x);}));
  return /^y(es)?$/i.test(String(ans).trim());
}
function prepareStableSource(root) {
  const dest=path.join(root,'.crew');
  const tmp=path.join(root,`.crew.tmp-${process.pid}`);
  const backup=path.join(root,`.crew.backup-${process.pid}`);
  fs.rmSync(tmp,{recursive:true,force:true});
  mkdirp(tmp);
  copy(path.join(PACKAGE_ROOT,'capabilities'),path.join(tmp,'capabilities'));
  copy(path.join(PACKAGE_ROOT,'CLAUDE-routing-fragment.md'),path.join(tmp,'CLAUDE-routing-fragment.md'));
  copy(path.join(PACKAGE_ROOT,'WORKFLOW-QUICK-REFERENCE.md'),path.join(tmp,'WORKFLOW-QUICK-REFERENCE.md'));
  if(exists(path.join(PACKAGE_ROOT,'docs','WORKFLOW-GUIDE.md'))) {
    mkdirp(path.join(tmp,'docs'));
    copy(path.join(PACKAGE_ROOT,'docs','WORKFLOW-GUIDE.md'),path.join(tmp,'docs','WORKFLOW-GUIDE.md'));
  }
  fs.writeFileSync(path.join(tmp,'VERSION'),VERSION+'\n');
  writeJson(path.join(tmp,'INSTALL-MANIFEST.json'),{
    schema:1,version:VERSION,installedAt:new Date().toISOString(),
    capabilities:CAPABILITIES,sourcePackage:path.basename(PACKAGE_ROOT)
  });
  fs.writeFileSync(path.join(tmp,'README.md'),
    '# Managed by Crew installer\n\nDo not hand-edit capability files here; re-run the installer to update them.\n');
  if(exists(backup)) fs.rmSync(backup,{recursive:true,force:true});
  if(exists(dest)) fs.renameSync(dest,backup);
  fs.renameSync(tmp,dest);
  return {dest,backup,restore(){
    fs.rmSync(dest,{recursive:true,force:true});
    if(exists(backup)) fs.renameSync(backup,dest);
  },commit(){fs.rmSync(backup,{recursive:true,force:true});}};
}
function parseCapabilityList(text) {
  try {
    const v=JSON.parse(text); return Array.isArray(v)?v:[];
  } catch {
    return [];
  }
}
function validateBundledManifests() {
  const errors=[];
  for(const id of CAPABILITIES) {
    const file=path.join(PACKAGE_ROOT,'capabilities',id,'capability.json');
    const cap=readJson(file);
    if(!cap) {
      errors.push(`${id}: missing/invalid capability.json`);
      continue;
    }
    if(cap.id!==id) errors.push(`${id}: id/folder mismatch (${cap.id})`);
    if(cap.role!=='feature') errors.push(`${id}: expected role=feature`);
    if(cap.version!==VERSION) errors.push(`${id}: manifest version ${cap.version} != package ${VERSION}`);
    const rc=cap.runtimeCompat;
    if(!rc || !Array.isArray(rc.supported) || rc.supported.length!==1 || rc.supported[0]!=='*') {
      errors.push(`${id}: runtimeCompat.supported must be ["*"] to avoid third-party concrete runtime-registry coupling`);
    }
    if(!rc || !Array.isArray(rc.unsupported)) {
      errors.push(`${id}: runtimeCompat.unsupported must be an array`);
    }
    if(rc && rc.notes && Object.keys(rc.notes).some(k=>k!=='*')) {
      errors.push(`${id}: runtimeCompat.notes must not reference concrete runtime ids`);
    }
  }
  // 배포본에는 canonical lib/ 이 없다(package.json files 참조). 사본을 신뢰할 근거는
  // 함께 실린 LIB-HASH.json 하나뿐이므로 그 기록과만 대조한다.
  //
  // 이 대조가 실제로 주는 성질은 두 가지다: (1) 사고성 drift 검출, (2) 사본만 고치고
  // 기록은 안 고친 한쪽 편집 검출. 기록도 같은 tarball 안에 있으므로 **둘 다 고친 경우는
  // 잡지 못한다** — canonical 을 같이 싣는 경우와 동일한 한계다. lib/ 을 안 싣는 이유는
  // 변조 저항이 아니라 단일 소스 규율이다.
  //
  // 검사 대상은 CAPABILITIES 가 아니라 capabilities/ 디렉터리 그 자체다. 설치 목록과
  // 검사 목록이 갈라지면 M1b 가 capability 를 늘릴 때 한쪽에만 넣어 그 사본이 검사 없이
  // 배포되는 사일런트 구멍이 생긴다. "배포본에 실제로 있는 것"을 검사 대상의 정의로 삼는다.
  const HEX64=/^[0-9a-f]{64}$/;
  const capsRoot=path.join(PACKAGE_ROOT,'capabilities');
  for(const id of (exists(capsRoot)?fs.readdirSync(capsRoot):[])) {
    const dir=path.join(capsRoot,id,'checks','lib');
    if(!exists(dir)) continue;                    // 이 capability 는 공유 lib 을 쓰지 않는다
    const record=readJson(path.join(dir,'LIB-HASH.json'));
    if(!record || record.schema!==1 || record.generatedFrom!=='lib/'
       || !record.files || typeof record.files!=='object' || Array.isArray(record.files)) {
      errors.push(`${id}: checks/lib exists without a readable schema-1 LIB-HASH.json`);
      continue;
    }
    const recorded=Object.keys(record.files);
    // 빈 기록은 정의상 모순이다. checks/lib/ 이 있다는 것 자체가 "이 capability 는 공유
    // lib 을 쓴다"는 선언인데, 기록이 비면 아래 두 루프가 모두 공회전해 **사본을 전부
    // 지운 패키지가 그대로 통과한다.** 그러면 게이트가 사용자 세션 한가운데서
    // Cannot find module 로 죽는다 — 설치 시점에 잡을 수 있었던 것을 가장 나쁜 순간으로 미룬다.
    if(!recorded.length) {
      errors.push(`${id}: LIB-HASH.json records no files — a checks/lib with nothing recorded cannot be verified`);
      continue;
    }
    for(const f of recorded) {
      // 기록 파일은 신뢰 경계다. 키를 그대로 join 하면 '../../bin/x.cjs' 같은 값이 패키지
      // 밖을 가리킬 수 있다. 단순 파일명만 허용한다.
      if(!f || f!==path.basename(f) || f==='.' || f==='..') {
        errors.push(`${id}: LIB-HASH.json key ${JSON.stringify(f)} is not a plain file name`);
        continue;
      }
      if(!HEX64.test(String(record.files[f]))) {
        errors.push(`${id}: checks/lib/${f} has a malformed sha256 in LIB-HASH.json`);
        continue;
      }
      const p=path.join(dir,f);
      if(!exists(p)) { errors.push(`${id}: checks/lib/${f} is recorded but missing`); continue; }
      const got=crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
      if(got!==record.files[f]) errors.push(`${id}: checks/lib/${f} sha256 mismatch (tampered or stale build)`);
    }
    // 확장자로 거르지 않는다 — .js/.mjs/.json 밀항자도 require 로 실행된다.
    // 기록 파일 자신만 예외다.
    for(const f of fs.readdirSync(dir)) {
      if(f!=='LIB-HASH.json' && !recorded.includes(f)) {
        errors.push(`${id}: checks/lib/${f} is not recorded in LIB-HASH.json`);
      }
    }
  }
  if(errors.length) {
    fail(`Bundled capability preflight failed:\n${errors.map(x=>`  - ${x}`).join('\n')}`);
  }
  return true;
}
// 실패한 설치가 남긴 원장을 소스와 같은 세대로 되돌린다.
//
// tx.restore() 는 .crew 소스만 되돌리므로 그것만으로는 "원장은 신버전 · 소스는 구버전"인
// 반쪽 상태가 남는다. 이전 설치본이 있었으면(hadPrevious) 되돌린 소스로 다시 등록하고,
// 없었으면(fresh) 이번에 손댄 것을 전부 지운다.
//
// 이 함수는 던지지 않는다 — 원래 실패를 덮어쓰면 사용자가 진짜 원인을 못 본다.
// 되돌리기에 실패하면 무엇을 손으로 해야 하는지 알린다.
function rollbackCapabilities(root,runner,touched,hadPrevious,opts) {
  if(!touched.length) return;
  if(!runner) {
    warn(`Install failed after touching: ${touched.join(', ')}. GSD CLI is unavailable, so the `+
      'capability ledger could not be rolled back. Re-run `crew install` once GSD is reachable.');
    return;
  }
  const stuck=[];
  for(const id of [...touched].reverse()) {
    const rem=gsdTry(runner,['capability','remove',id,'--scope','project'],root);
    // "not installed"는 정상이다(설치 전에 죽은 id). 그 외의 비-0 은 원장이 그대로라는 뜻이다.
    if(rem.code!==0 && !/not installed/i.test(rem.stderr||rem.stdout||'')) {
      stuck.push(`${id} (remove: ${(rem.stderr||rem.stdout||'').trim()})`);
      continue;
    }
    if(!hadPrevious) continue;
    const re=gsdTry(runner,['capability','install',`./.crew/capabilities/${id}`,'--scope','project','--yes'],root);
    if(re.code!==0) stuck.push(`${id} (reinstall: ${(re.stderr||re.stdout||'').trim()})`);
  }
  if(stuck.length) {
    warn(`Rollback could not reinstate: ${stuck.join(', ')}. Run \`crew install\` again, or remove `+
      'them with `gsd-tools capability remove <id> --scope project` and reinstall.');
  } else {
    log(hadPrevious
      ? 'Rolled the capability ledger back to the previously installed generation.'
      : 'Removed the partially installed capabilities left by the failed run.');
  }
}
function installCapabilities(root,runner,opts,touched=[]) {
  let list=[];
  const before=gsdTry(runner,['capability','list','--scope','project'],root);
  if(before.code===0) list=parseCapabilityList(before.stdout);
  for(const id of CAPABILITIES) {
    const old=list.find(x=>x.id===id && x.scope==='project');
    log(old ? `Refreshing ${id}...` : `Installing ${id}...`);
    touched.push(id);                       // 여기서부터 이 id 는 이번 실행의 책임이다

    // Always attempt removal first. This repairs a prior interrupted install even
    // when `capability list` cannot accurately surface the stale ledger entry.
    // "not installed" is intentionally ignored.
    const rem=gsdTry(runner,['capability','remove',id,'--scope','project'],root);
    if(rem.code!==0 && old && opts.verbose) {
      warn(`remove ${id}: ${(rem.stderr||rem.stdout).trim()}`);
    }

    const spec=`./.crew/capabilities/${id}`;
    gsdExec(runner,['capability','install',spec,'--scope','project','--yes'],root,opts);
  }
  const after=gsdExec(runner,['capability','list','--scope','project'],root,opts);
  const rows=parseCapabilityList(after.stdout);
  const bad=[];
  for(const id of CAPABILITIES) {
    const row=rows.find(x=>x.id===id && x.scope==='project');
    if(!row || row.status!=='active') bad.push({id,row:row||null});
  }
  if(bad.length) fail(`Capability activation failed: ${JSON.stringify(bad,null,2)}`);
  return rows.filter(x=>CAPABILITIES.includes(x.id));
}
function managedRoutingBlock() {
  const body=fs.readFileSync(path.join(PACKAGE_ROOT,'CLAUDE-routing-fragment.md'),'utf8').trim();
  return `${ROUTING_START}\n${body}\n${ROUTING_END}`;
}
function installRouting(root) {
  const p=path.join(root,'CLAUDE.md');
  const block=managedRoutingBlock();
  let text=exists(p)?fs.readFileSync(p,'utf8'):'';
  const start=text.indexOf(ROUTING_START), end=text.indexOf(ROUTING_END);
  if(start>=0 && end>=start) {
    text=text.slice(0,start)+block+text.slice(end+ROUTING_END.length);
  } else {
    text=text.replace(/\s*$/,'');
    text+=(text?'\n\n':'')+block+'\n';
  }
  fs.writeFileSync(p,text.endsWith('\n')?text:text+'\n');
}
function removeRouting(root) {
  const p=path.join(root,'CLAUDE.md'); if(!exists(p))return;
  let text=fs.readFileSync(p,'utf8');
  const start=text.indexOf(ROUTING_START), end=text.indexOf(ROUTING_END);
  if(start>=0 && end>=start) {
    text=(text.slice(0,start)+text.slice(end+ROUTING_END.length)).replace(/\n{3,}/g,'\n\n').trimEnd();
    if(text) fs.writeFileSync(p,text+'\n'); else fs.rmSync(p,{force:true});
  }
}
function capabilitySkillStems(baseDir,id) {
  const dir=path.join(baseDir,'capabilities',id,'skills');
  if(!exists(dir)) return [];
  let ents=[]; try{ents=fs.readdirSync(dir,{withFileTypes:true});}catch{return [];}
  return ents
    .filter(e=>e.isDirectory() && exists(path.join(dir,e.name,'SKILL.md')))
    .map(e=>e.name)
    .sort();
}
function expectedSkillDirs(baseDir=PACKAGE_ROOT) {
  const out=[];
  for(const id of CAPABILITIES) {
    for(const stem of capabilitySkillStems(baseDir,id)) out.push(`${SKILL_PREFIX}${stem}`);
  }
  return out;
}
// GSD only materializes capability skills into a runtime skills root from the
// GLOBAL overlay ($HOME/.gsd/capabilities), and only when something calls its
// surface-apply path. A project-scoped capability install therefore reports
// active/surfaced while nothing ever reaches Claude Code. Crew keeps the
// capability project-scoped (so its gates never leak into unrelated repositories)
// and copies the skills into the project's own .claude/skills directory itself.
function installProjectSkills(root) {
  const destRoot=path.join(root,'.claude','skills');
  const installed=[];
  for(const id of CAPABILITIES) {
    const srcRoot=path.join(root,'.crew','capabilities',id,'skills');
    if(!exists(srcRoot)) continue;
    for(const stem of capabilitySkillStems(path.join(root,'.crew'),id)) {
      const name=`${SKILL_PREFIX}${stem}`;
      const dst=path.join(destRoot,name);
      if(exists(dst) && !exists(path.join(dst,SKILL_MARKER))) {
        fail(`refusing to overwrite unmanaged skill directory: ${dst}`);
      }
      fs.rmSync(dst,{recursive:true,force:true});
      mkdirp(destRoot);
      copy(path.join(srcRoot,stem),dst);
      fs.writeFileSync(path.join(dst,SKILL_MARKER),`${id}\n${VERSION}\n`);
      installed.push(name);
    }
  }
  return installed;
}
function removeProjectSkills(root) {
  const destRoot=path.join(root,'.claude','skills');
  if(!exists(destRoot)) return [];
  const removed=[];
  let ents=[]; try{ents=fs.readdirSync(destRoot,{withFileTypes:true});}catch{return [];}
  for(const e of ents) {
    if(!e.isDirectory()) continue;
    const dir=path.join(destRoot,e.name);
    if(!exists(path.join(dir,SKILL_MARKER))) continue;
    fs.rmSync(dir,{recursive:true,force:true});
    removed.push(e.name);
  }
  try { if(fs.readdirSync(destRoot).length===0) fs.rmSync(destRoot,{recursive:true,force:true}); } catch {}
  return removed;
}
function installShipGuard(root,opts) {
  const script=path.join(PACKAGE_ROOT,'scripts','install-claude-ship-guard.cjs');
  run(process.execPath,[script,root],{cwd:root,inherit:opts.verbose,timeout:30000});
}
function removeShipGuard(root) {
  const hook=path.join(root,'.claude','hooks','crew-ship-guard.cjs');
  fs.rmSync(hook,{force:true});
  const settingsPath=path.join(root,'.claude','settings.json');
  const settings=readJson(settingsPath);
  if(settings && settings.hooks && Array.isArray(settings.hooks.PreToolUse)) {
    settings.hooks.PreToolUse=settings.hooks.PreToolUse.filter(group=>{
      const hooks=Array.isArray(group&&group.hooks)?group.hooks:[];
      return !hooks.some(h=>String(h&&h.command||'').includes('crew-ship-guard.cjs'));
    });
    if(settings.hooks.PreToolUse.length===0) delete settings.hooks.PreToolUse;
    if(Object.keys(settings.hooks).length===0) delete settings.hooks;
    writeJson(settingsPath,settings);
  }
}
function capabilityList(root,runner) {
  if(!runner)return [];
  const r=gsdTry(runner,['capability','list','--scope','project'],root);
  return r.code===0?parseCapabilityList(r.stdout):[];
}
function doctor(root,opts={}) {
  const nodeV=process.version.replace(/^v/,'');
  const gsd=resolveGsd(root);
  const gstack=detectGstack();
  const superpowers=findSuperpowers();
  const rows=capabilityList(root,gsd);
  const checks=[];
  const add=(id,state,detail)=>checks.push({id,state,detail});
  add('node',gte(nodeV,[24,0,0])?'PASS':'FAIL',`Node ${nodeV}; GSD target requires >=24`);
  add('git',commandPath('git')?'PASS':'FAIL',commandPath('git')||'not found');
  add('gsd',gsd?'PASS':'FAIL',gsd?gsd.display:'capability CLI not found');
  add('gstack-source',gstack.sourcePresent?'PASS':'FAIL',gstack.source);
  add('gstack-skill-id',
    gstack.shortSkills?'PASS':(gstack.prefixedSkills?'WARN':'FAIL'),
    gstack.shortSkills?'short skills active (/review)':(gstack.prefixedSkills?'only namespaced gstack-review detected; Crew defaults expect short IDs':'review skill not surfaced'));
  add('superpowers',superpowers?'PASS':'WARN',superpowers||'not detected; install from Claude official plugin marketplace');
  try {
    validateBundledManifests();
    add('bundle-runtime-compat','PASS','all bundled feature capabilities use runtimeCompat.supported=["*"]');
  } catch(err) {
    add('bundle-runtime-compat','FAIL',err.message);
  }
  add('stable-source',exists(path.join(root,'.crew','VERSION'))?'PASS':'FAIL',path.join(root,'.crew'));
  for(const id of CAPABILITIES) {
    const row=rows.find(x=>x.id===id && x.scope==='project');
    add(`capability:${id}`,row&&row.status==='active'?'PASS':'FAIL',row?`status=${row.status}`:'not active/not listed');
  }
  const skillsRoot=path.join(root,'.claude','skills');
  const expectedSkills=expectedSkillDirs();
  const missingSkills=expectedSkills.filter(n=>!exists(path.join(skillsRoot,n,'SKILL.md')));
  add('skills-installed',
    missingSkills.length?'FAIL':'PASS',
    missingSkills.length
      ? `missing from ${skillsRoot}: ${missingSkills.join(', ')} — Claude Code cannot see these skills; re-run install`
      : `${expectedSkills.length} skills present in ${skillsRoot}`);
  const shadowed=expectedSkills.filter(n=>exists(path.join(os.homedir(),'.claude','skills',n,'SKILL.md')));
  add('skills-no-global-shadow',
    shadowed.length?'WARN':'PASS',
    shadowed.length
      ? `also present in ~/.claude/skills: ${shadowed.join(', ')} — a stale global copy can shadow this project's version`
      : 'no conflicting global copies');
  add('routing',exists(path.join(root,'CLAUDE.md')) && fs.readFileSync(path.join(root,'CLAUDE.md'),'utf8').includes(ROUTING_START)?'PASS':'WARN','managed CLAUDE.md routing block');
  const hookPath=path.join(root,'.claude','hooks','crew-ship-guard.cjs');
  add('ship-guard',exists(hookPath)?'PASS':'WARN','Claude PreToolUse guard');
  let hookExec=false;
  try { hookExec=(fs.statSync(hookPath).mode & 0o111)!==0; } catch {}
  add('ship-guard-exec',
    !exists(hookPath)?'WARN':(hookExec?'PASS':'WARN'),
    !exists(hookPath)?'guard not installed':(hookExec?'guard file is executable':'guard file is not executable; it is invoked through `node` so this is advisory only'));
  const settings=readJson(path.join(root,'.claude','settings.json'));
  const guardCommands=[];
  for(const group of (settings&&settings.hooks&&Array.isArray(settings.hooks.PreToolUse)?settings.hooks.PreToolUse:[])) {
    for(const h of (Array.isArray(group&&group.hooks)?group.hooks:[])) {
      const c=String(h&&h.command||'');
      if(c.includes('crew-ship-guard.cjs')) guardCommands.push(c);
    }
  }
  add('ship-guard-registered',
    guardCommands.length===0?'WARN':(guardCommands.every(c=>/^node\s/.test(c))?'PASS':'FAIL'),
    guardCommands.length===0
      ? 'no PreToolUse(Bash) registration found'
      : (guardCommands.every(c=>/^node\s/.test(c))
        ? 'guard registered with an explicit node interpreter'
        : `legacy registration without \`node\` prefix will fail unless the file is executable: ${guardCommands.join(' | ')}`));
  const summary={
    pass:checks.filter(x=>x.state==='PASS').length,
    warn:checks.filter(x=>x.state==='WARN').length,
    fail:checks.filter(x=>x.state==='FAIL').length,
  };
  return {schema:1,version:VERSION,projectRoot:root,checks,summary,ready:summary.fail===0};
}
function printDoctor(d,jsonMode) {
  if(jsonMode){log(JSON.stringify(d,null,2));return;}
  log(`Crew installer doctor — v${d.version}`);
  log(`Project: ${d.projectRoot}\n`);
  for(const c of d.checks) log(`${c.state.padEnd(4)} ${c.id.padEnd(30)} ${c.detail}`);
  log(`\nREADY=${d.ready} PASS=${d.summary.pass} WARN=${d.summary.warn} FAIL=${d.summary.fail}`);
}
function runStatus(root,args=[]) {
  const staged=path.join(root,'.gsd','capabilities','crew-guide','checks','workflow-guide.cjs');
  const stable=path.join(root,'.crew','capabilities','crew-guide','checks','workflow-guide.cjs');
  const script=exists(staged)?staged:stable;
  if(!exists(script)) fail('Crew guide is not installed. Run install first.');
  const r=run(process.execPath,[script,'status',...args],{cwd:root,timeout:30000});
  process.stdout.write(r.stdout);
}
async function install(root,opts) {
  if(!exists(root) || !fs.statSync(root).isDirectory()) fail(`Project directory does not exist: ${root}`);
  if(VERSION.includes('-') && !opts.allowPrerelease) {
    fail(`Crew v${VERSION} is a prerelease build from a development branch. Install a tagged release instead, or pass --allow-prerelease to proceed anyway.`,4);
  }
  if(sameRealPath(root, os.homedir())) {
    fail(`Refusing to install with the home directory as project root ($HOME = ${os.homedir()}). A $HOME-rooted install collapses project scope into global scope. Run from inside a project, or pass --project <project path>.`,4);
  }
  // 패키지 자체의 결함이므로 대상 환경(GSD·gstack·Node 24)과 무관하다. dry-run 반환보다
  // 뒤에 두면 --dry-run 이 변조된 패키지를 통과시킨다 — 검사는 쓰기 전에, 그리고
  // 동의를 구하기 전에 끝나야 한다. 위 두 펜스보다는 뒤다: "설치하면 안 되는 빌드/경로"가
  // "패키지가 변조됐다"보다 먼저 나와야 첫 오류가 실제 원인을 가리킨다.
  validateBundledManifests();
  log('Capability manifest preflight: PASS');
  const actions=[
    `vendor Crew v${VERSION} runtime files to ${path.join(root,'.crew')}`,
    `install/refresh ${CAPABILITIES.length} project-scoped GSD capabilities with explicit consent`,
    `install ${expectedSkillDirs().length} Crew skills into ${path.join(root,'.claude','skills')}`,
  ];
  if(opts.routing) actions.push('add/update a managed Crew section in CLAUDE.md');
  if(opts.shipGuard) actions.push('install/update Claude Code PreToolUse ship guard');
  if(opts.bootstrap) actions.push('bootstrap missing GSD and gstack dependencies when possible');
  if(!(await consent(opts,actions))) fail('Installation cancelled.',3);
  if(opts.dryRun) { log('DRY RUN'); for(const a of actions)log(`- ${a}`); return; }

  const nodeV=process.version.replace(/^v/,'');
  if(!gte(nodeV,[24,0,0]) && process.env.CREW_ALLOW_UNSUPPORTED_NODE !== '1') {
    fail(`Node ${nodeV} detected. Current GSD 1.10 requires Node >=24. Upgrade Node and re-run.`);
  }
  if(!gte(nodeV,[24,0,0]) && process.env.CREW_ALLOW_UNSUPPORTED_NODE === '1') {
    warn(`Test-only override: continuing on unsupported Node ${nodeV}. Do not use this override for real GSD.`);
  }
  if(!commandPath('git')) fail('git is required.');

  let gsd=resolveGsd(root);
  if(!gsd && opts.bootstrap) {
    bootstrapGsd(root,opts);
    gsd=resolveGsd(root);
  }
  if(!gsd) fail('GSD is not installed/detectable. Re-run with --bootstrap or install GSD first.');

  let gstack=detectGstack();
  if((!gstack.sourcePresent || (!gstack.shortSkills && !gstack.prefixedSkills)) && opts.bootstrap) {
    bootstrapGstack(opts);
    gstack=detectGstack();
  }
  if(!gstack.sourcePresent) fail('gstack source/setup not detected. Re-run with --bootstrap or install gstack first.');
  if(!gstack.shortSkills) {
    warn('gstack short skill IDs (/review, /qa-only, /cso) were not detected.');
    if(gstack.prefixedSkills) warn('Namespaced gstack skills are present. Re-run gstack setup with --no-prefix or configure Crew skill IDs.');
    else warn('Run gstack setup before using Crew quality adapters.');
    if(opts.strict) fail('Strict install requires gstack short skill IDs to be surfaced.');
  }

  const superpowersBefore=findSuperpowers();
  if(!superpowersBefore && opts.strict) {
    fail('Strict install requires Superpowers. In Claude Code run: /plugin install superpowers@claude-plugins-official');
  }

  const tx=prepareStableSource(root);
  // restore() 가 backup 을 dest 로 rename 하므로 이 값은 반드시 restore 전에 읽어야 한다.
  // 뒤에 읽으면 항상 false 가 되고, 업그레이드 실패가 롤백 대신 "전부 제거"로 끝난다.
  const hadPrevious=exists(tx.backup);
  const touched=[];
  try {
    const rows=installCapabilities(root,gsd,opts,touched);
    const skills=installProjectSkills(root);
    if(opts.routing) installRouting(root);
    if(opts.shipGuard) installShipGuard(root,opts);
    tx.commit();
    log('');
    log(`Crew v${VERSION} installed successfully.`);
    log(`Project: ${root}`);
    log(`Capabilities: ${rows.map(x=>`${x.id}=${x.status}`).join(', ')}`);
    log(`Skills: ${skills.length} installed in ${path.join('.claude','skills')} (${skills.join(', ')})`);
    log('');
    const sp=findSuperpowers();
    if(!sp) {
      warn('Superpowers plugin was not detected. In Claude Code run: /plugin install superpowers@claude-plugins-official');
    }
    log('Next: restart/reload Claude Code if needed, then run /crew-gsd');
    log('Doctor: npx crew-harness doctor');
  } catch(err) {
    tx.restore();                                    // 소스를 먼저 되돌린다
    rollbackCapabilities(root,gsd,touched,hadPrevious,opts);   // 그다음 원장을 맞춘다
    throw err;
  }
}
async function uninstall(root,opts) {
  const actions=[
    'remove Crew project capability registrations',
    'remove .crew managed source directory',
    'remove Crew skills from .claude/skills',
    'remove managed CLAUDE.md routing block',
    'remove Crew ship guard hook',
  ];
  if(!(await consent(opts,actions))) fail('Uninstall cancelled.',3);
  const runner=resolveGsd(root);
  if(runner) {
    for(const id of [...CAPABILITIES].reverse()) {
      const r=gsdTry(runner,['capability','remove',id,'--scope','project'],root);
      if(r.code!==0 && opts.verbose) warn(`${id}: ${(r.stderr||r.stdout).trim()}`);
    }
  } else warn('GSD CLI unavailable; removing project files but capability ledger may require manual cleanup.');
  const removedSkills=removeProjectSkills(root);
  fs.rmSync(path.join(root,'.crew'),{recursive:true,force:true});
  removeRouting(root);
  removeShipGuard(root);
  if(removedSkills.length) log(`Removed skills: ${removedSkills.join(', ')}`);
  log(`Crew project integration removed from ${root}`);
}
// 개명 전 설치본의 제거. 현행 crew 설치는 건드리지 않는다 — 그건 `crew uninstall` 이다.
// 판단과 파괴는 scripts/uninstall-legacy.cjs 가 하고, 여기서는 스코프 결정 · 백업 게이트 ·
// 동의 · 출력만 한다.
async function uninstallLegacy(root,opts) {
  const {planRemoval,checkBackup,applyRemoval}=
    require(path.join(PACKAGE_ROOT,'scripts','uninstall-legacy.cjs'));

  // 기본은 프로젝트. 홈은 --global 을 명시해야 열린다 (D13 재발 방지선).
  // 두 스코프가 같은 트리를 가리키면(예: --project "$HOME" --global, 또는 심볼릭 링크로
  // 같은 곳을 도달하는 경우) 한 번만 센다 — realpath 로 비교한다(:81 sameRealPath, install()
  // 도 :582 에서 같은 이유로 이 술어를 쓴다). 문자열 resolve 비교는 symlink 를 통과한 동일
  // 트리를 다른 트리로 오판해 같은 홈을 두 번 계획하고 두 번 파괴한다.
  const scopes=[{root,scope:'project',label:`project ${root}`,from:opts.from}];
  if(opts.global && !sameRealPath(os.homedir(),root)) {
    scopes.push({root:os.homedir(),scope:'global',label:`home ${os.homedir()}`,from:opts.fromGlobal});
  }

  const plans=scopes.map(s=>({...s,plan:planRemoval(s.root)}));

  // 판정 불가가 하나라도 있으면 파괴 경로에 들어가지 않는다. "모른다"를 "없다"로
  // 읽는 순간 조용한 누락이 된다. plan.count 는 판정된 대상만 센다 — undetermined 는
  // 별도 배열이라 count 에 안 잡힌다. 그래서 이 게이트가 "할 일 없음" 판단보다 먼저 돈다.
  for(const {plan,label} of plans) {
    if(plan.undetermined.length) {
      fail(`UNDETERMINED targets under ${label}:\n`+
        plan.undetermined.map(x=>`  - ${x}`).join('\n')+
        '\nRemoval refuses to run while anything is undetermined. Inspect those paths by hand first.',2);
    }
  }

  const total=plans.reduce((n,p)=>n+p.plan.count,0);
  if(total===0) { log('nothing to remove: no pre-rename installation found.'); return; }

  if(opts.skipBackupCheck) {
    warn('--skip-backup-check: removing without verifying that a backup covers these targets.');
  } else {
    for(const s of plans) {
      const {plan,label}=s;
      if(!plan.count) continue;
      const res=checkBackup(plan,s.from);
      if(!res.ok) {
        const flag=s.scope==='global' ? '--from-global' : '--from';
        const backupCmd=`node ${path.join(PACKAGE_ROOT,'scripts','legacy-backup.cjs')} backup`+
          (plan.root===os.homedir()?'':` --root ${plan.root}`);
        fail(`backup check failed for ${label}:\n`+
          res.problems.map(x=>`  - ${x}`).join('\n')+
          `\nTake one first:  ${backupCmd}\n`+
          `Then re-run with ${flag} <that directory>. Override with --skip-backup-check at your own risk.`,2);
      }
    }
  }

  const actions=plans.filter(p=>p.plan.count)
    .map(({plan,label})=>`${label}: remove ${plan.count} legacy item(s)`);
  if(!(await consent(opts,actions))) fail('Legacy removal cancelled.',3);

  const runner=resolveGsd(root);
  if(!runner) warn('GSD CLI unavailable; capability ledger entries will be reported, not removed.');
  const failures=[];
  for(const {plan,scope} of plans) {
    if(!plan.count) continue;
    const r=applyRemoval(plan,{runner,scope,dryRun:opts.dryRun,run:gsdTry});
    for(const a of r.actions) log(a);
    failures.push(...r.failures);
  }
  if(failures.length) {
    for(const f of failures) warn(f);
    // 되돌릴 수 있어야 완료다(설계 §2.4). 흔한 사례(GSD 접근 불가)는 파일은 이미
    // 지워진 채 원장만 남는다 — 이 명령은 멱등이라 원인을 고친 뒤 그대로 다시 돌리면
    // 남은 것만 마저 처리한다. 전부 되돌리고 싶다면 --from 으로 넘긴 백업이 있다.
    warn('Recovery: this command is idempotent — fix the cause above (e.g. make GSD reachable '+
      'again) and re-run it unchanged; it will only touch what is still left. To undo everything '+
      `instead, restore from backup: node ${path.join(PACKAGE_ROOT,'scripts','legacy-backup.cjs')} `+
      'restore --from <that directory>.');
    fail(`legacy removal finished with ${failures.length} failure(s); see the warnings above.`,1);
  }
  log(opts.dryRun
    ? 'dry run complete — nothing was written.'
    : 'Legacy pre-rename installation removed.');
}
function help() {
  log(`Crew Workflow Installer v${VERSION}

Usage:
  crew [install] [options]
  crew doctor [--project PATH] [--json]
  crew status [--project PATH]
  crew uninstall [--project PATH] [--yes]
  crew uninstall-legacy [--project PATH] [--global] --from <backup dir>
                        [--dry-run] [--skip-backup-check] [--yes]
  crew version

Install options:
  --project PATH       Target project (default: current git root)
  --yes, -y            Non-interactive consent
  --bootstrap          Install missing GSD/gstack when possible (default)
  --no-bootstrap       Only use already-installed dependencies
  --no-routing         Do not add managed CLAUDE.md routing block
  --no-ship-guard      Do not install Claude PreToolUse ship guard
  --dry-run            Show actions without writing
  --strict             Reserved for stricter dependency checks
  --verbose, -v        Show more child-process detail
  --allow-prerelease   Install even when VERSION is a prerelease build

Legacy removal options:
  --global             Also remove the pre-rename installation from $HOME (default: project only)
  --from PATH          Backup covering the project-scope removal targets (required)
  --from-global PATH   Backup covering the home-scope removal targets (required with --global)
  --skip-backup-check  Remove without verifying the backups (dangerous)

Immediate local package usage:
  npx --yes --package ./crew-harness-0.6.5.tgz crew install --yes

After npm publish:
  npx --yes crew-harness@latest install --yes
`);
}
async function main() {
  const opts=parse(process.argv.slice(2));
  const root=projectRoot(opts.project);
  if(opts.command==='help') return help();
  if(opts.command==='version'||opts.command==='--version') return log(VERSION);
  if(opts.command==='doctor') {
    const d=doctor(root,opts); printDoctor(d,opts.json); process.exitCode=d.ready?0:1; return;
  }
  if(opts.command==='status') return runStatus(root);
  if(opts.command==='uninstall-legacy') return uninstallLegacy(root,opts);
  if(opts.command==='uninstall') return uninstall(root,opts);
  if(opts.command==='install') return install(root,opts);
  fail(`unknown command: ${opts.command}`,2);
}
// 설치 순서를 소유하는 배열은 계약 테스트와 L2 픽스처가 읽어야 한다. 그런데 이 파일을
// require 하면 CLI 가 그대로 돌아버리므로 main() 은 직접 실행일 때만 부른다.
module.exports = { CAPABILITIES };

if (require.main === module) {
  main().catch(err=>{
    process.stderr.write(`Crew installer: ${err.message}\n`);
    process.exit(err.exitCode || 1);
  });
}
