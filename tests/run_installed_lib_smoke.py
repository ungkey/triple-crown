#!/usr/bin/env python3
"""설치된 트리에서 공유 lib 소비자가 실제로 로드되는지 확인한다.

L1 lib-layout 은 저장소 트리에서 require 경로를 **정적으로** 검사한다. 배포·설치 경로에서
사본이 따라가는지, 그 위치에서 형제 참조까지 해석되는지는 실행해 봐야만 알 수 있다.
"""
import os, subprocess, tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CLI = ROOT / "bin" / "triple-crown.cjs"

with tempfile.TemporaryDirectory() as td:
    home = Path(td) / "home"; project = Path(td) / "proj"
    home.mkdir(); project.mkdir()
    # main 은 재구성 기간 내내 프리릴리스 VERSION 을 달고 있다(설계 §4.5 계층 2).
    # 이 스모크는 "배포 가능한가"가 아니라 "설치 동작이 온전한가"를 보므로 펜스를 명시적으로 연다.
    env = dict(os.environ, HOME=str(home), TRIPLE_CROWN_ALLOW_UNSUPPORTED_NODE="1")
    p = subprocess.run(
        ["node", str(CLI), "install", "--project", str(project),
         "--yes", "--no-bootstrap", "--no-ship-guard", "--allow-prerelease"],
        cwd=str(ROOT), env=env, capture_output=True, text=True)
    assert p.returncode == 0, p.stderr

    hits = sorted(Path(td).rglob("checks/lib/repo-state-lib.cjs"))
    assert hits, "no installed copy of checks/lib/repo-state-lib.cjs found under the install roots"
    for lib in hits:
        # evidence-store 는 형제 ./repo-state-lib.cjs 를 require 한다 — 둘 다 로드해야
        # "사본 디렉터리 안에서 형제 참조가 해석된다"가 증명된다.
        r = subprocess.run(
            ["node", "-e",
             "require(process.argv[1]);require(process.argv[2]);console.log('ok')",
             str(lib), str(lib.parent / "evidence-store.cjs")],
            capture_output=True, text=True)
        assert r.returncode == 0 and "ok" in r.stdout, f"{lib}: {r.stderr}"

print("PASS installed-shared-lib-require")
