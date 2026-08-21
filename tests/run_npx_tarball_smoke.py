#!/usr/bin/env python3
from pathlib import Path
import os, tempfile, subprocess, shutil, json, sys

ROOT=Path(__file__).resolve().parents[1]
EXPECTED_VERSION=(ROOT/"VERSION").read_text().strip()
TGZ=ROOT/f"crew-harness-{EXPECTED_VERSION}.tgz"
FAKE=ROOT/"tests"/"fake-gsd.cjs"

def run(cmd,cwd,env=None):
    p=subprocess.run(cmd,cwd=cwd,text=True,capture_output=True,env=env)
    if p.returncode!=0:
        raise AssertionError(f"{cmd}\nOUT={p.stdout}\nERR={p.stderr}")
    return p

def prepare():
    root=Path(tempfile.mkdtemp(prefix="tc-npx-release-"))
    home=root/"home"; home.mkdir()
    project=root/"project"; project.mkdir()
    run(["git","init","-q"],project)
    run(["git","config","user.email","npx@example.invalid"],project)
    run(["git","config","user.name","NPX Test"],project)
    (project/"README.md").write_text("# Demo\n",encoding="utf-8")
    run(["git","add","."],project); run(["git","commit","-qm","baseline"],project)
    gs=home/".claude"/"skills"/"gstack"; (gs/"review").mkdir(parents=True)
    (gs/"setup").write_text("#!/usr/bin/env bash\nexit 0\n",encoding="utf-8")
    (gs/"review"/"SKILL.md").write_text("---\nname: review\n---\n",encoding="utf-8")
    short=home/".claude"/"skills"/"review"; short.mkdir(parents=True)
    (short/"SKILL.md").write_text("---\nname: review\n---\n",encoding="utf-8")
    env=os.environ.copy()
    env["HOME"]=str(home); env["USERPROFILE"]=str(home)
    env["CREW_GSD_BIN"]=str(FAKE)
    env["CREW_ALLOW_UNSUPPORTED_NODE"]="1"
    return root,home,project,env

# main 은 v0.7 재구성 기간 내내 프리릴리스 VERSION 을 달고 있다(설계 §4.5 계층 2).
# 이 스모크는 "배포 가능한가"가 아니라 "설치 동작이 온전한가"를 보므로 펜스를 명시적으로 연다.
def main():
    if not TGZ.exists():
        raise AssertionError(f"missing npm tarball: {TGZ}")
    root,home,project,env=prepare()
    try:
        p=run([
            "npx","--yes","--package",str(TGZ),
            "crew","install",
            "--allow-prerelease",
            "--project",str(project),"--yes","--no-bootstrap","--no-ship-guard"
        ],project,env)
        assert "installed successfully" in p.stdout
        assert (project/".crew"/"VERSION").read_text().strip()==EXPECTED_VERSION
        rows=json.loads((project/".fake-gsd-capabilities.json").read_text())
        assert {x["id"] for x in rows}=={"crew-discipline","crew-quality","crew-guide"}
        print("PASS npx-local-tarball-install")
    finally:
        shutil.rmtree(root,ignore_errors=True)

if __name__=="__main__":
    main()
