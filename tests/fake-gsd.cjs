#!/usr/bin/env node
'use strict';
const fs=require('fs'), path=require('path');
const args=process.argv.slice(2), cwd=process.cwd();
const ledger=path.join(cwd,'.fake-gsd-capabilities.json');
function read(){try{return JSON.parse(fs.readFileSync(ledger,'utf8'));}catch{return []}}
function write(v){fs.writeFileSync(ledger,JSON.stringify(v,null,2)+'\n')}
function copy(src,dst){fs.cpSync(src,dst,{recursive:true,force:true})}
if(args[0]==='capability' && args[1]==='list'){
  console.log(JSON.stringify(read(),null,2)); process.exit(0);
}
if(args[0]==='capability' && args[1]==='remove'){
  const id=args[2]; write(read().filter(x=>x.id!==id));
  fs.rmSync(path.join(cwd,'.gsd','capabilities',id),{recursive:true,force:true});
  console.log(`removed ${id}`); process.exit(0);
}
if(args[0]==='capability' && args[1]==='install'){
  const spec=args[2], src=path.resolve(cwd,spec);
  const m=JSON.parse(fs.readFileSync(path.join(src,'capability.json'),'utf8'));
  // 테스트 전용 실패 주입. 롤백의 재설치까지 죽이면 "이전 세대로 되돌린다"는 계약 자체를
  // 검증할 수 없으므로 **첫 시도에서만** 발화한다. 마커는 원장 옆에 둔다.
  if(process.env.FAKE_GSD_FAIL_INSTALL===m.id){
    const mark=path.join(cwd,'.fake-gsd-failed-once');
    if(!fs.existsSync(mark)){
      fs.writeFileSync(mark,m.id+'\n');
      console.error(`fake-gsd: injected failure installing ${m.id}`); process.exit(1);
    }
  }
  if (m.role==='feature') {
    const rc=m.runtimeCompat || {};
    const concreteSupported=Array.isArray(rc.supported) ? rc.supported.filter(x=>x!=='*') : [];
    const concreteNotes=rc.notes && typeof rc.notes==='object' ? Object.keys(rc.notes).filter(x=>x!=='*') : [];
    if (concreteSupported.length || concreteNotes.length) {
      console.error(
        `Error: capability install blocked: Cross-capability validation failed: ` +
        concreteSupported.map(x=>`capability "${m.id}" runtimeCompat.supported references unknown runtime "${x}"`).concat(
          concreteNotes.map(x=>`capability "${m.id}" runtimeCompat.notes references unknown runtime "${x}"`)
        ).join('; ')
      );
      process.exit(1);
    }
  }
  const dst=path.join(cwd,'.gsd','capabilities',m.id);
  fs.mkdirSync(path.dirname(dst),{recursive:true});
  fs.rmSync(dst,{recursive:true,force:true}); copy(src,dst);
  const rows=read().filter(x=>x.id!==m.id);
  rows.push({id:m.id,role:m.role,version:m.version,tier:m.tier,source:spec,scope:'project',status:'active',reason:null,title:m.title});
  write(rows);
  console.log(JSON.stringify({status:'installed',id:m.id},null,2)); process.exit(0);
}
console.error(`fake-gsd unsupported: ${args.join(' ')}`); process.exit(2);
