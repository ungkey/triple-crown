#!/usr/bin/env python3
from pathlib import Path
import subprocess, sys
ROOT=Path(__file__).resolve().parents[1]
p=subprocess.run([sys.executable,str(ROOT/"tests"/"run_v061_l0.py")],cwd=ROOT)
raise SystemExit(p.returncode)
