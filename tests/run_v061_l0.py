#!/usr/bin/env python3
from pathlib import Path
import subprocess, sys

ROOT = Path(__file__).resolve().parents[1]

def run(cmd):
    p = subprocess.run(cmd, cwd=ROOT, text=True, capture_output=True)
    if p.returncode != 0:
        print(p.stdout)
        print(p.stderr, file=sys.stderr)
        raise SystemExit(p.returncode)
    return p

run([sys.executable, str(ROOT/"tests"/"validate_prototype.py")])
run(["node", str(ROOT/"e2e"/"doctor.cjs"), "--mock", "--json"])
run(["node", str(ROOT/"e2e"/"run-live.cjs"), "--mock"])
run([sys.executable, str(ROOT/"tests"/"run_local_smoke.py")])
run([sys.executable, str(ROOT/"tests"/"run_guide_smoke.py")])
print("PASS Triple Crown v0.6.1 L0 aggregate")
