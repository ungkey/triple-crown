#!/usr/bin/env python3
"""설치된 트리에서 공유 lib 소비자가 실제로 로드되는지 확인한다.

L1 lib-layout 은 저장소 트리에서 require 경로를 **정적으로** 검사한다. 배포·설치 경로에서
사본이 따라가는지, 그 위치에서 형제 참조까지 해석되는지는 실행해 봐야만 알 수 있다.
"""
import os, subprocess, tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CLI = ROOT / "bin" / "crew.cjs"
FAKE = ROOT / "tests" / "fake-gsd.cjs"


def fixture(td):
    # 이 스모크는 install() 이 실제로 GSD/gstack 을 부트스트랩하는지가 아니라 그 결과인
    # "설치된 트리에서 사본 require 가 해석되는가"만 증명한다. run_installer_smoke.py 의
    # env_for()/fixture() 와 같은 패턴을 쓰되, 이 스모크에 실제로 필요한 최소치만 둔다 —
    # gstack short-skill 표식 하나뿐, 그 형제 테스트의 자체 단언(qa-only/cso/... SKILL.md,
    # git 이력이 있는 프로젝트)은 옮기지 않는다.
    home = Path(td) / "home"; project = Path(td) / "proj"
    home.mkdir(); project.mkdir()
    gs = home / ".claude" / "skills" / "gstack"
    (gs / "review").mkdir(parents=True)
    (gs / "setup").write_text("#!/usr/bin/env bash\nexit 0\n", encoding="utf-8")
    (gs / "review" / "SKILL.md").write_text("---\nname: review\n---\n", encoding="utf-8")
    short = home / ".claude" / "skills" / "review"
    short.mkdir(parents=True, exist_ok=True)
    (short / "SKILL.md").write_text("---\nname: review\n---\n", encoding="utf-8")
    return home, project


def env_for(home):
    e = os.environ.copy()
    e["HOME"] = str(home)
    e["USERPROFILE"] = str(home)
    e["CREW_GSD_BIN"] = str(FAKE)
    # main 은 재구성 기간 내내 프리릴리스 VERSION 을 달고 있다(설계 §4.5 계층 2).
    # 이 스모크는 "배포 가능한가"가 아니라 "설치 동작이 온전한가"를 보므로 펜스를 명시적으로 연다.
    e["CREW_ALLOW_UNSUPPORTED_NODE"] = "1"
    return e


with tempfile.TemporaryDirectory() as td:
    home, project = fixture(td)
    env = env_for(home)
    p = subprocess.run(
        ["node", str(CLI), "install", "--project", str(project),
         "--yes", "--no-bootstrap", "--no-ship-guard", "--allow-prerelease"],
        cwd=str(ROOT), env=env, capture_output=True, text=True)
    assert p.returncode == 0, p.stderr

    hits = sorted(Path(td).rglob("checks/lib/repo-state-lib.cjs"))
    assert hits, "no installed copy of checks/lib/repo-state-lib.cjs found under the install roots"
    # M1b 이후 evidence-store 사본은 crew-quality 에만 심긴다(LIB_MAP). 형제 참조 해석은
    # 그 사본에서 증명하고, 나머지 사본은 단독 로드만 확인한다. 형제 쌍을 한 번도 못
    # 돌았으면 아래에서 실패한다 — 증명이 조용히 사라지는 것을 막는다.
    siblings_exercised = 0
    for lib in hits:
        args = [str(lib)]
        ev = lib.parent / "evidence-store.cjs"
        if ev.exists():
            args.append(str(ev)); siblings_exercised += 1
        r = subprocess.run(
            ["node", "-e",
             "for(const m of process.argv.slice(1))require(m);console.log('ok')",
             *args],
            capture_output=True, text=True)
        assert r.returncode == 0 and "ok" in r.stdout, f"{lib}: {r.stderr}"

    assert siblings_exercised, ("no installed copy paired repo-state-lib with "
                                "evidence-store — the sibling-require proof stopped running")

print("PASS installed-shared-lib-require")
