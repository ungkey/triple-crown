#!/usr/bin/env python3
from pathlib import Path
import json, re

ROOT = Path(__file__).resolve().parents[1]
CAPS = ROOT / "capabilities"

POINTS = {
    "discuss:pre","discuss:post","plan:pre","plan:post",
    "execute:pre","execute:wave:pre","execute:wave:post","execute:post",
    "verify:pre","verify:post","ship:pre","ship:post"
}

def fail(msg): raise AssertionError(msg)

def load(name):
    p = CAPS/name/"capability.json"
    cap = json.loads(p.read_text(encoding="utf-8"))
    if cap["id"] != name: fail(f"{name}: id/folder mismatch")
    for k in ("role","version","title","description","tier","requires","runtimeCompat","skills","agents","hooks","config","steps","contributions","gates"):
        if k not in cap: fail(f"{name}: missing {k}")
    return cap

def validate(name, cap):
    skills=set(cap["skills"]); config=set(cap["config"])
    for stem in skills:
        if not (CAPS/name/"skills"/stem/"SKILL.md").exists(): fail(f"{name}: missing skill {stem}")
    for step in cap['steps']:
        if step["point"] not in POINTS: fail(f"{name}: invalid step point")
        if "skill" in step["ref"] and step["ref"]["skill"] not in skills: fail(f"{name}: unowned skill")
        for k in ("produces","consumes","onError"):
            if k not in step: fail(f"{name}: step missing {k}")
        if "when" in step and step["when"] not in config: fail(f"{name}: bad step when")
    for c in cap['contributions']:
        if c["point"] not in POINTS: fail(f"{name}: bad contribution point")
        if "path" in c["fragment"] and not (CAPS/name/c["fragment"]["path"]).exists(): fail(f"{name}: missing fragment")
    for gate in cap['gates']:
        if gate["point"] not in POINTS: fail(f"{name}: bad gate point")
        for k in ("check","blocking","onError"):
            if k not in gate: fail(f"{name}: gate missing {k}")
        if "when" in gate and gate["when"] not in config: fail(f"{name}: bad gate when")
        pred=gate["check"].get("predicate")
        if pred:
            if pred.get("kind")!="command-exit-zero": fail(f"{name}: prototype expects command-exit-zero")
            for rel in re.findall(r'\$\{GSD_CAP_DIR\}/([^\"]+)', pred.get("command","")):
                if ".." in Path(rel).parts or not (CAPS/name/rel).exists(): fail(f"{name}: missing gate target {rel}")

    if name == "crew-ship":
        post=[s for s in cap["steps"] if s["point"]=="ship:post" and s["ref"].get("skill")=="crew-gsd-postship"]
        if len(post)!=1: fail("missing unique crew-gsd-postship step")
        if post[0]["onError"]!="skip": fail("ship:post must be best-effort/onError skip")
        if "UAT.md" not in post[0]["consumes"]: fail("ship:post must consume UAT.md")
        guards=[g for g in cap["gates"] if g["point"]=="ship:pre" and "ship-guard-control.cjs" in g["check"].get("predicate",{}).get("command","")]
        if len(guards)!=1: fail("missing ship authorization arm gate")
        for key in ("crew.ship.owner","crew.ship.guard_enabled","crew.gstack.canary_mode","crew.gstack.document_release_mode","crew.gstack.retro_mode"):
            if key not in cap["config"]: fail(f"missing config {key}")

def main():
    for name in sorted(p.name for p in CAPS.iterdir() if p.is_dir()):
        cap=load(name); validate(name,cap); print(f'PASS: {name}')

    guide = load("crew-guide")
    if guide["steps"] or guide["contributions"] or guide["gates"]:
        fail("crew-guide must remain read-only/no lifecycle hooks")
    if guide["skills"] != ["crew-gsd"]:
        fail("crew-guide must expose one unified situational skill")
    for rel in (
        "capabilities/crew-guide/checks/workflow-guide.cjs",
        "docs/WORKFLOW-GUIDE.md",
        "WORKFLOW-QUICK-REFERENCE.md",
    ):
        if not (ROOT/rel).exists():
            fail(f"missing workflow guide file {rel}")

    for rel in ("guards/crew-ship-guard.cjs","scripts/install-claude-ship-guard.cjs","claude-hooks/settings.fragment.json"):
        if not (ROOT/rel).exists(): fail(f"missing {rel}")
    for rel in (
        "e2e/doctor.cjs",
        "e2e/mock-gsd.cjs",
        "e2e/assert-hooks.cjs",
        "e2e/run-live.cjs",
        "e2e/compatibility-baseline.json",
        "e2e/ACCEPTANCE-RUNBOOK.md",
    ):
        if not (ROOT/rel).exists():
            fail(f"missing v0.6 harness file {rel}")
    print("PASS: v0.6.1 core structure / workflow guide / ship ownership")
    print("PASS: v0.6.1 E2E harness files")

if __name__=="__main__": main()
