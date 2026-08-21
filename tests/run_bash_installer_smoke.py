#!/usr/bin/env python3
from pathlib import Path
import os, tempfile, subprocess, shutil

ROOT=Path(__file__).resolve().parents[1]
FAKE=ROOT/"tests"/"fake-gsd.cjs"

def run(cmd,cwd,env=None):
    p=subprocess.run(cmd,cwd=cwd,text=True,capture_output=True,env=env)
    if p.returncode!=0:
        raise AssertionError(f"{cmd}\nOUT={p.stdout}\nERR={p.stderr}")
    return p

# main 은 v0.7 재구성 기간 내내 프리릴리스 VERSION 을 달고 있다(설계 §4.5 계층 2).
# 이 스모크는 "배포 가능한가"가 아니라 "설치 동작이 온전한가"를 보므로 펜스를 명시적으로 연다.
def main():
    root=Path(tempfile.mkdtemp(prefix="tc-bash-release-"))
    home=root/"home";home.mkdir()
    project=root/"project";project.mkdir()
    try:
        run(["git","init","-q"],project)
        run(["git","config","user.email","bash@example.invalid"],project)
        run(["git","config","user.name","Bash Test"],project)
        gs=home/".claude"/"skills"/"gstack";(gs/"review").mkdir(parents=True)
        (gs/"setup").write_text("#!/usr/bin/env bash\nexit 0\n")
        (gs/"review"/"SKILL.md").write_text("---\nname: review\n---\n")
        short=home/".claude"/"skills"/"review";short.mkdir(parents=True)
        (short/"SKILL.md").write_text("---\nname: review\n---\n")
        env=os.environ.copy()
        env["HOME"]=str(home);env["USERPROFILE"]=str(home)
        env["TRIPLE_GSD_BIN"]=str(FAKE)
        env["TRIPLE_CROWN_ALLOW_UNSUPPORTED_NODE"]="1"
        p=run(["bash",str(ROOT/"install.sh"),"--yes","--no-bootstrap","--no-ship-guard","--allow-prerelease","--project",str(project)],project,env)
        assert "installed successfully" in p.stdout
        assert (project/".triple-crown"/"VERSION").exists()
        print("PASS bash-local-installer")
    finally:
        shutil.rmtree(root,ignore_errors=True)

if __name__=="__main__":
    main()
