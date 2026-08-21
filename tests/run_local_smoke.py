#!/usr/bin/env python3
from pathlib import Path
import json, subprocess, tempfile, shutil

ROOT=Path(__file__).resolve().parents[1]
# 이 스모크가 부르는 것은 ship-guard-control · release-ledger · canary-session ·
# docs-release-session 넷뿐이고 M1b 가 전부 crew-ship 으로 옮겼다.
CHECKS=ROOT/"capabilities"/"crew-ship"/"checks"
GUARD=ROOT/"guards"/"crew-ship-guard.cjs"
INSTALLER=ROOT/"scripts"/"install-claude-ship-guard.cjs"

def run(cmd,cwd,input_text=None,ok=False):
    p=subprocess.run(cmd,cwd=cwd,text=True,input=input_text,capture_output=True)
    if ok and p.returncode!=0:
        raise AssertionError(f"{cmd}\nOUT:{p.stdout}\nERR:{p.stderr}")
    return p

def git(root,*args): return run(["git",*args],root,ok=True)
def load(p): return json.loads(Path(p).read_text(encoding="utf-8"))
def assert_(v,msg):
    if not v: raise AssertionError(msg)

def repo():
    root=Path(tempfile.mkdtemp(prefix="tc-v05-"))
    git(root,"init","-q")
    git(root,"config","user.email","test@example.com")
    git(root,"config","user.name","TC Test")
    git(root,"checkout","-qb","phase/01-demo")
    (root/"src").mkdir()
    (root/"src"/"app.js").write_text("module.exports=()=>1;\n",encoding="utf-8")
    (root/"README.md").write_text("# Demo\n",encoding="utf-8")
    git(root,"add","src/app.js","README.md");git(root,"commit","-qm","baseline")
    phase=root/".planning"/"phases"/"01-demo";phase.mkdir(parents=True)
    (root/".planning"/"STATE.md").write_text("Current Phase: 1\n",encoding="utf-8")
    (phase/"01-UAT.md").write_text("---\nstatus: complete\nphase: 01-demo\n---\n\n## Tests\n\n",encoding="utf-8")
    return root,phase

def hook(root,session,command,script=GUARD):
    evt={"session_id":session,"cwd":str(root),"tool_name":"Bash","tool_input":{"command":command}}
    p=run(["node",str(script)],root,input_text=json.dumps(evt))
    data=json.loads(p.stdout) if p.stdout.strip() else {}
    decision=data.get("hookSpecificOutput",{}).get("permissionDecision")
    reason=data.get("hookSpecificOutput",{}).get("permissionDecisionReason","")
    return decision,reason

def scenario_installer():
    root,phase=repo()
    try:
        (root/".claude").mkdir(exist_ok=True)
        (root/".claude"/"settings.json").write_text(json.dumps({"permissions":{"allow":["Read"]},"hooks":{"PostToolUse":[]}}),encoding="utf-8")
        run(['node',str(INSTALLER),str(root)],ROOT,ok=True)
        run(['node',str(INSTALLER),str(root)],ROOT,ok=True)
        settings=load(root/".claude"/"settings.json")
        assert_(settings["permissions"]["allow"]==["Read"],"existing settings lost")
        pre=settings["hooks"]["PreToolUse"]
        matches=[g for g in pre if g.get("matcher")=="Bash" and any("crew-ship-guard.cjs" in h.get("command","") for h in g.get("hooks",[]))]
        assert_(len(matches)==1,"installer not idempotent")
        cmds=[h["command"] for g in matches for h in g["hooks"] if "crew-ship-guard.cjs" in h.get("command","")]
        assert_(all(c.startswith("node ") for c in cmds),f"guard must run through an explicit interpreter: {cmds}")
        hook=root/".claude"/"hooks"/"crew-ship-guard.cjs"
        assert_(hook.exists(),"hook not copied")
        assert_(bool(hook.stat().st_mode & 0o111),"hook not executable")
        return "PASS guard-installer-idempotent"
    finally: shutil.rmtree(root,ignore_errors=True)

def scenario_ship_guard():
    root,phase=repo()
    try:
        d,r=hook(root,"S1","git push origin phase/01-demo")
        assert_(d=="deny" and "GSD owns ship" in r,"direct push must be denied")
        run(["node",str(CHECKS/"ship-guard-control.cjs"),"arm-gsd",str(phase)],root,ok=True)
        d,r=hook(root,"S1","git push origin phase/01-demo"); assert_(d=="allow",r)
        d,r=hook(root,"S1","gh pr create --title demo --body x --base main"); assert_(d=="allow",r)
        d,r=hook(root,"S1","gh pr create --title duplicate --body x --base main"); assert_(d=="deny" and "exhausted" in r,"second PR create must deny")
        d,r=hook(root,"S2","git push origin phase/01-demo"); assert_(d=="deny" and "another Claude session" in r,"cross-session push must deny")
        d,r=hook(root,"S1","gh pr merge 1"); assert_(d=="deny" and "merge" in r.lower(),"merge must deny")
        run(["node",str(CHECKS/"ship-guard-control.cjs"),"disarm-gsd",str(phase)],root,ok=True)
        return "PASS gsd-ship-authorization/session/action-limits"
    finally: shutil.rmtree(root,ignore_errors=True)

def scenario_docs_push_guard():
    root,phase=repo()
    try:
        run(["node",str(CHECKS/"ship-guard-control.cjs"),"arm-docs",str(phase)],root,ok=True)
        (root/"README.md").write_text("# Demo\n\nUpdated docs.\n",encoding="utf-8")
        git(root,"add","README.md");git(root,"commit","-qm","docs update")
        d,r=hook(root,"D1","git push origin phase/01-demo"); assert_(d=="allow",r)
        run(["node",str(CHECKS/"ship-guard-control.cjs"),"disarm-docs",str(phase)],root,ok=True)
        run(["node",str(CHECKS/"ship-guard-control.cjs"),"arm-docs",str(phase)],root,ok=True)
        (root/"src"/"app.js").write_text("module.exports=()=>2;\n",encoding="utf-8")
        git(root,"add","src/app.js");git(root,"commit","-qm","runtime change")
        d,r=hook(root,"D2","git push origin phase/01-demo")
        assert_(d=="deny" and "non-authorized paths" in r,"runtime path must block docs push")
        return "PASS docs-only-push-allowlist"
    finally: shutil.rmtree(root,ignore_errors=True)

def scenario_release_ledger():
    root,phase=repo()
    try:
        run(["node",str(CHECKS/"release-ledger.cjs"),"capture",str(phase)],root,ok=True)
        rel=load(phase/"RELEASE.json")
        assert_(rel["owner"]=="gsd","release owner")
        sha=rel["effectiveReleaseSha"]
        run(["node",str(CHECKS/"release-ledger.cjs"),"record-deployment",str(phase),"--status","deployed","--url","https://example.test","--sha",sha,"--environment","production"],root,ok=True)
        p=run(["node",str(CHECKS/"release-ledger.cjs"),"ready",str(phase)],root,ok=True)
        ready=json.loads(p.stdout);assert_(ready["canaryReady"] is True,"matching deployment should be canary ready")
        run(["node",str(CHECKS/"release-ledger.cjs"),"record-deployment",str(phase),"--status","deployed","--url","https://example.test","--sha","deadbeef"],root,ok=True)
        p=run(["node",str(CHECKS/"release-ledger.cjs"),"ready",str(phase)],root,ok=True)
        assert_(json.loads(p.stdout)["canaryReady"] is False,"mismatched deployment must not be canary ready")
        return "PASS release/deployment-sha-binding"
    finally: shutil.rmtree(root,ignore_errors=True)

def scenario_canary_session():
    root,phase=repo()
    try:
        run(["node",str(CHECKS/"release-ledger.cjs"),"capture",str(phase)],root,ok=True)
        sha=load(phase/"RELEASE.json")["effectiveReleaseSha"]
        run(["node",str(CHECKS/"release-ledger.cjs"),"record-deployment",str(phase),"--url","https://example.test","--sha",sha],root,ok=True)
        run(["node",str(CHECKS/"canary-session.cjs"),"begin",str(phase)],root,ok=True)
        norm=phase/".crew"/"canary-normalized.json";norm.parent.mkdir(exist_ok=True)
        norm.write_text(json.dumps({"schema":1,"status":"pass","mode":"quick","summary":"healthy","findings":[],"evidence":[{"kind":"browser","ref":"ok"}]}),encoding="utf-8")
        run(["node",str(CHECKS/"canary-session.cjs"),"finalize",str(phase),str(norm)],root,ok=True)
        can=load(phase/"GSTACK-CANARY.json");assert_(can["status"]=="pass" and can["deployedSha"]==sha,"canary artifact incorrect")
        return "PASS canary-matching-deployment"
    finally: shutil.rmtree(root,ignore_errors=True)

def scenario_docs_session():
    root,phase=repo()
    try:
        run(["node",str(CHECKS/"docs-release-session.cjs"),"begin",str(phase)],root,ok=True)
        (root/"README.md").write_text("# Demo\n\nDocs.\n",encoding="utf-8")
        git(root,"add","README.md");git(root,"commit","-qm","docs")
        run(["node",str(CHECKS/"docs-release-session.cjs"),"finalize",str(phase),"--status","pass"],root,ok=True)
        doc=load(phase/"GSTACK-DOCUMENT-RELEASE.json");assert_(doc["status"]=="pass" and not doc["forbiddenFiles"],"docs-only finalization")
        run(["node",str(CHECKS/"docs-release-session.cjs"),"begin",str(phase)],root,ok=True)
        (root/"src"/"app.js").write_text("module.exports=()=>9;\n",encoding="utf-8")
        git(root,"add","src/app.js");git(root,"commit","-qm","bad docs mutation")
        p=run(["node",str(CHECKS/"docs-release-session.cjs"),"finalize",str(phase),"--status","pass"],root)
        bad=load(phase/"GSTACK-DOCUMENT-RELEASE.json");assert_(p.returncode!=0 and bad["status"]=="blocked" and "src/app.js" in bad["forbiddenFiles"],"forbidden docs mutation must block")
        return "PASS document-release-post-mutation-check"
    finally: shutil.rmtree(root,ignore_errors=True)

def main():
    for fn in [scenario_installer,scenario_ship_guard,scenario_docs_push_guard,scenario_release_ledger,scenario_canary_session,scenario_docs_session]:
        print(fn())
    print("PASS v0.6 inherited release-contract smoke")

if __name__=="__main__": main()
