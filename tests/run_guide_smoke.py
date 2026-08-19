#!/usr/bin/env python3
from pathlib import Path
import tempfile, shutil, subprocess, json, hashlib, os

ROOT=Path(__file__).resolve().parents[1]
GUIDE=ROOT/"capabilities"/"triple-crown-guide"/"checks"/"workflow-guide.cjs"

def run(root,*args):
    env=os.environ.copy()
    env["TRIPLE_CROWN_GUIDE_DISABLE_PROBES"]="1"
    p=subprocess.run(["node",str(GUIDE),*args,"--json"],cwd=root,text=True,capture_output=True,env=env)
    if p.returncode!=0:
        raise AssertionError(f"guide failed {args}\nOUT={p.stdout}\nERR={p.stderr}")
    return json.loads(p.stdout)

def git(root,*args):
    p=subprocess.run(["git",*args],cwd=root,text=True,capture_output=True)
    if p.returncode!=0: raise AssertionError(p.stderr)
    return p.stdout.strip()

def fixture():
    root=Path(tempfile.mkdtemp(prefix="tc-guide-"))
    git(root,"init","-q")
    git(root,"config","user.email","guide@example.invalid")
    git(root,"config","user.name","Guide Test")
    (root/".planning"/"phases"/"01-auth").mkdir(parents=True)
    (root/".planning"/"STATE.md").write_text("Current Phase: 1\n",encoding="utf-8")
    (root/".planning"/"config.json").write_text("{}\n",encoding="utf-8")
    (root/"app.js").write_text("console.log('x')\n",encoding="utf-8")
    git(root,"add",".");git(root,"commit","-qm","baseline")
    return root,root/".planning"/"phases"/"01-auth"

def write_plan(phase):
    p=phase/"01-01-PLAN.md"
    p.write_text("# Plan\n\nDo auth.\n",encoding="utf-8")
    return p

def digest_plan(phase):
    h=hashlib.sha256()
    for p in sorted(phase.glob("*-PLAN.md")):
        h.update(p.name.encode());h.update(b"\0");h.update(p.read_bytes());h.update(b"\0")
    return "sha256:"+h.hexdigest()

def mark_plan(phase):
    (phase/"GSTACK-PLAN-REVIEW.json").write_text(json.dumps({
        "schema":1,"reviewer":"gstack/plan-eng-review","status":"pass",
        "planDigest":digest_plan(phase),"planFiles":[p.name for p in sorted(phase.glob("*-PLAN.md"))]
    }),encoding="utf-8")

def summary(phase):
    (phase/"01-01-SUMMARY.md").write_text("# Summary\n\nDone.\n",encoding="utf-8")

def review(phase,status="pass",mutated=False):
    (phase/"GSTACK-CODE-REVIEW.json").write_text(json.dumps({
        "schema":1,"reviewer":"gstack/review","status":status,"mutated":mutated,
        "freshVerificationRequired":mutated
    }),encoding="utf-8")
    (phase/"MUTATION.json").write_text(json.dumps({"schema":1,"changed":mutated}),encoding="utf-8")
    if mutated:
        (phase/"EVIDENCE.json").write_text(json.dumps({"schema":1,"records":[]}),encoding="utf-8")

def qa(phase,status="pass",issue=False):
    tests=[{"name":"logout","expected":"login","result":"issue","severity":"major"}] if issue else [{"name":"login","expected":"dashboard","result":"pass"}]
    (phase/"GSTACK-QA.json").write_text(json.dumps({
        "schema":1,"runner":"gstack/qa-only","status":"findings" if issue else status,
        "unexpectedMutation":False,"tests":tests,"findings":[],"manualTests":[]
    }),encoding="utf-8")
    (phase/"GSTACK-QA-UAT-BRIDGE.json").write_text(json.dumps({"schema":1,"importedFindingCount":1 if issue else 0}),encoding="utf-8")

def verification(phase,status="passed"):
    (phase/"01-VERIFICATION.md").write_text(f"---\nphase: 01-auth\nstatus: {status}\n---\n\n# Verification\n",encoding="utf-8")

def uat_gap(phase):
    (phase/"01-UAT.md").write_text("""---
status: complete
phase: 01-auth
---

## Tests

### 1. Logout
expected: login
result: issue
reported: "session remains active"
severity: major

## Gaps

- gap_id: G-01-1
  status: failed
""",encoding="utf-8")

def security(phase,status="pass"):
    (phase/"GSTACK-SECURITY.json").write_text(json.dumps({
        "schema":1,"runner":"gstack/cso","status":status,"blockOn":"high",
        "findings":[],"unexpectedMutation":False
    }),encoding="utf-8")

def release(phase,matches=None):
    data={"schema":1,"owner":"gsd","releaseState":"pr_open",
          "effectiveReleaseSha":"abc","pr":{"state":"OPEN","headSha":"abc"}}
    if matches is not None:
        data["deployment"]={"status":"deployed","url":"https://example.test",
                            "deployedSha":"abc" if matches else "def","matchesRelease":matches}
    (phase/"RELEASE.json").write_text(json.dumps(data),encoding="utf-8")

def canary(phase,status="pass"):
    (phase/"GSTACK-CANARY.json").write_text(json.dumps({"schema":1,"runner":"gstack/canary","status":status,"url":"https://example.test"}),encoding="utf-8")

def assert_eq(v,e,msg):
    if v!=e: raise AssertionError(f"{msg}: got={v!r} expected={e!r}")

def scenario_plan_review():
    root,phase=fixture()
    try:
        write_plan(phase)
        s=run(root,"status")
        assert_eq(s["blocker"]["stage"],"plan","plan blocker")
        assert_eq(s["next"]["command"],"/plan-eng-review","plan next")
        return "PASS guide-plan-review-blocker"
    finally: shutil.rmtree(root,ignore_errors=True)

def scenario_execute():
    root,phase=fixture()
    try:
        write_plan(phase);mark_plan(phase)
        s=run(root,"status")
        assert_eq(s["currentStage"],"execute","execute current")
        assert_eq(s["next"]["command"],"/gsd-execute-phase 1","execute next")
        return "PASS guide-execute-next"
    finally: shutil.rmtree(root,ignore_errors=True)

def scenario_review():
    root,phase=fixture()
    try:
        write_plan(phase);mark_plan(phase);summary(phase)
        s=run(root,"status")
        assert_eq(s["next"]["command"],"/gsd-triple-gstack-code-review 1","review next")
        return "PASS guide-review-next"
    finally: shutil.rmtree(root,ignore_errors=True)

def scenario_qa_gap():
    root,phase=fixture()
    try:
        write_plan(phase);mark_plan(phase);summary(phase);review(phase);qa(phase,issue=True);uat_gap(phase)
        s=run(root,"status")
        assert_eq(s["blocker"]["stage"],"verify","verify blocker")
        assert_eq(s["next"]["command"],"/gsd-plan-phase 1 --gaps","gap next")
        return "PASS guide-qa-gap->gsd-gap-plan"
    finally: shutil.rmtree(root,ignore_errors=True)

def scenario_ship():
    root,phase=fixture()
    try:
        write_plan(phase);mark_plan(phase);summary(phase);review(phase);qa(phase);verification(phase);security(phase)
        s=run(root,"status")
        assert_eq(s["next"]["command"],"/gsd-ship 1","ship next")
        return "PASS guide-ship-next"
    finally: shutil.rmtree(root,ignore_errors=True)

def scenario_deploy_mismatch():
    root,phase=fixture()
    try:
        write_plan(phase);mark_plan(phase);summary(phase);review(phase);qa(phase);verification(phase);security(phase);release(phase,False)
        s=run(root,"status")
        assert_eq(s["blocker"]["stage"],"deploy","deploy blocker")
        assert_eq(s["next"]["command"],"/gsd-triple-gstack-release-observe 1","deploy recovery")
        return "PASS guide-deployment-mismatch"
    finally: shutil.rmtree(root,ignore_errors=True)

def scenario_canary():
    root,phase=fixture()
    try:
        write_plan(phase);mark_plan(phase);summary(phase);review(phase);qa(phase);verification(phase);security(phase);release(phase,True)
        s=run(root,"status")
        assert_eq(s["next"]["command"],"/gsd-triple-gstack-release-observe 1 --canary","canary next")
        canary(phase)
        s=run(root,"status")
        assert_eq(s["next"]["command"],"/gsd-progress --next","phase complete next")
        return "PASS guide-canary-complete"
    finally: shutil.rmtree(root,ignore_errors=True)

def main():
    for fn in [scenario_plan_review,scenario_execute,scenario_review,scenario_qa_gap,scenario_ship,scenario_deploy_mismatch,scenario_canary]:
        print(fn())
    print("PASS Triple Crown workflow guide smoke")

if __name__=="__main__":
    main()
