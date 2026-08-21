#!/usr/bin/env python3
from pathlib import Path
import os, tempfile, subprocess, shutil, json, sys

ROOT=Path(__file__).resolve().parents[1]
CLI=ROOT/"bin"/"triple-crown.cjs"
FAKE=ROOT/"tests"/"fake-gsd.cjs"

def run(cmd,cwd,env=None,ok=True):
    p=subprocess.run(cmd,cwd=cwd,text=True,capture_output=True,env=env)
    if ok and p.returncode!=0:
        raise AssertionError(f"cmd failed {cmd}\nOUT={p.stdout}\nERR={p.stderr}")
    return p

def fixture():
    root=Path(tempfile.mkdtemp(prefix="tc-installer-"))
    home=root/"home"; home.mkdir()
    project=root/"project"; project.mkdir()
    run(["git","init","-q"],project)
    run(["git","config","user.email","installer@example.invalid"],project)
    run(["git","config","user.name","Installer Test"],project)
    (project/"README.md").write_text("# Demo\n",encoding="utf-8")
    run(["git","add","."],project);run(["git","commit","-qm","baseline"],project)

    # Minimal gstack installation with short skill surfaced.
    gs=home/".claude"/"skills"/"gstack"; (gs/"review").mkdir(parents=True)
    (gs/"setup").write_text("#!/usr/bin/env bash\nexit 0\n",encoding="utf-8")
    (gs/"review"/"SKILL.md").write_text("---\nname: review\n---\n",encoding="utf-8")
    for skill in ["review","qa-only","cso","canary","document-release","retro","plan-eng-review"]:
        d=home/".claude"/"skills"/skill; d.mkdir(parents=True,exist_ok=True)
        (d/"SKILL.md").write_text(f"---\nname: {skill}\n---\n",encoding="utf-8")
    return root,home,project

def env_for(home):
    e=os.environ.copy()
    e["HOME"]=str(home)
    e["USERPROFILE"]=str(home)
    e["TRIPLE_GSD_BIN"]=str(FAKE)
    e["TRIPLE_CROWN_ALLOW_UNSUPPORTED_NODE"]="1"
    return e

# main 은 v0.7 재구성 기간 내내 프리릴리스 VERSION 을 달고 있다(설계 §4.5 계층 2).
# 이 스모크는 "배포 가능한가"가 아니라 "설치 동작이 온전한가"를 보므로 펜스를 명시적으로 연다.
def main():
    root,home,project=fixture()
    try:
        env=env_for(home)
        p=run(["node",str(CLI),"install","--project",str(project),"--yes","--no-bootstrap","--allow-prerelease"],ROOT,env)
        assert "installed successfully" in p.stdout
        expected_version=(ROOT/"VERSION").read_text().strip()
        assert (project/".triple-crown"/"VERSION").read_text().strip()==expected_version
        rows=json.loads((project/".fake-gsd-capabilities.json").read_text())
        ids={x["id"] for x in rows}
        assert ids=={"triple-superpowers","triple-gstack","triple-crown-guide"},ids
        assert (project/".gsd"/"capabilities"/"triple-crown-guide"/"capability.json").exists()
        text=(project/"CLAUDE.md").read_text()
        assert text.count("<!-- triple-crown:managed-routing:start -->")==1
        hook=project/".claude"/"hooks"/"triple-crown-ship-guard.cjs"
        assert hook.exists()
        # Claude Code executes the hook; without the executable bit the direct
        # invocation form dies with EACCES, so both the bit and the `node` prefix matter.
        assert hook.stat().st_mode & 0o111, "ship guard hook is not executable"
        settings=json.loads((project/".claude"/"settings.json").read_text())
        commands=[h["command"] for g in settings["hooks"]["PreToolUse"] for h in g.get("hooks",[])
                  if "triple-crown-ship-guard.cjs" in h.get("command","")]
        assert commands and all(c.startswith("node ") for c in commands),commands

        # Claude Code only discovers skills under .claude/skills — a GSD capability
        # install alone never reaches that directory.
        skills=project/".claude"/"skills"
        expected={"gsd-triple-crown","gsd-triple-gstack-code-review","gsd-triple-gstack-qa-only",
                  "gsd-triple-gstack-cso","gsd-triple-gstack-post-ship","gsd-triple-gstack-release-observe"}
        present={d.name for d in skills.iterdir() if d.is_dir()}
        assert expected<=present,f"missing skills: {sorted(expected-present)}"
        for name in sorted(expected):
            body=(skills/name/"SKILL.md").read_text(encoding="utf-8")
            assert f"name: {name}\n" in body,f"{name}: frontmatter name must match directory name"
            assert (skills/name/".triple-crown-skill").exists(),f"{name}: ownership marker missing"

        # Idempotent reinstall should not duplicate routing/hook registration.
        run(["node",str(CLI),"install","--project",str(project),"--yes","--no-bootstrap","--allow-prerelease"],ROOT,env)
        text=(project/"CLAUDE.md").read_text()
        assert text.count("<!-- triple-crown:managed-routing:start -->")==1
        settings=json.loads((project/".claude"/"settings.json").read_text())
        groups=settings["hooks"]["PreToolUse"]
        matching=[g for g in groups if any("triple-crown-ship-guard.cjs" in h.get("command","") for h in g.get("hooks",[]))]
        assert len(matching)==1

        # Status must work from staged capability.
        (project/".planning"/"phases"/"01-demo").mkdir(parents=True)
        (project/".planning"/"STATE.md").write_text("Current Phase: 1\n",encoding="utf-8")
        (project/".planning"/"phases"/"01-demo"/"01-01-PLAN.md").write_text("# Plan\n",encoding="utf-8")
        st=run(["node",str(CLI),"status","--project",str(project)],ROOT,env)
        assert "Triple Crown Status" in st.stdout
        assert "/plan-eng-review" in st.stdout

        # Uninstall should clean managed surfaces without deleting README.
        # A hand-authored skill sharing the gsd- prefix must survive uninstall.
        keep=project/".claude"/"skills"/"gsd-user-owned"; keep.mkdir(parents=True)
        (keep/"SKILL.md").write_text("---\nname: gsd-user-owned\n---\n",encoding="utf-8")

        run(["node",str(CLI),"uninstall","--project",str(project),"--yes"],ROOT,env)
        assert not (project/".triple-crown").exists()
        assert not (project/".claude"/"hooks"/"triple-crown-ship-guard.cjs").exists()
        assert not (project/".claude"/"skills"/"gsd-triple-crown").exists()
        assert (keep/"SKILL.md").exists(),"uninstall deleted an unmanaged skill"
        assert not (project/"CLAUDE.md").exists() or "triple-crown:managed-routing" not in (project/"CLAUDE.md").read_text()
        assert (project/"README.md").exists()
        print("PASS installer-install-idempotent-status-uninstall")
    finally:
        shutil.rmtree(root,ignore_errors=True)

if __name__=="__main__":
    main()
