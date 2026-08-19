# Triple Crown v0.6.4 — One-command Installer + Workflow Guide

## Install first

The normal installation path is now **one command**.

### Immediate — from the downloadable `.tgz`

```bash
npx --yes --package ./triple-crown-workflow-installer-0.6.4.tgz triple-crown install --yes
```

### After npm publish

```bash
npx --yes triple-crown-workflow-installer@latest install --yes
```

### From an extracted release

```bash
bash install.sh --yes
```

The installer handles:

```text
GSD/gstack prerequisite detection/bootstrap
→ stable .triple-crown source copy
→ triple-superpowers
→ triple-gstack
→ triple-crown-guide
→ .claude/skills (6 Triple Crown skills)
→ CLAUDE.md routing
→ Claude ship guard
→ activation verification
```

Skills are installed into the **target project's** `.claude/skills/` directory, so
Claude Code sees them the moment the project is opened and no other repository on
the machine is affected. Verify with:

```bash
npx triple-crown-workflow-installer doctor
```

`skills-installed` must be `PASS`.

Superpowers is checked separately because its official Claude Code install is the
Claude plugin command:

```text
/plugin install superpowers@claude-plugins-official
```

Full installer documentation: `docs/INSTALLER.md`.

After installation:

```text
/gsd-triple-crown
```

shows current workflow position and next action.

---

## 작업 중 길을 잃지 않기 위한 Workflow Guide

v0.6.1은 E2E harness 위에 **read-only situational UX**를 추가합니다.

가장 먼저 기억할 명령은 하나입니다.

```text
/gsd-triple-crown
```

이 명령은 현재 phase에서:

```text
PLAN
EXECUTE
REVIEW
EVIDENCE
QA
VERIFY/UAT
SECURITY
SHIP
DEPLOY
CANARY
```

의 완료/현재/대기/차단 상태를 보여주고 **다음 owner와 명령**을 제시합니다.

```text
/gsd-triple-crown next
/gsd-triple-crown resume
/gsd-triple-crown help workflow
/gsd-triple-crown help recovery
/gsd-triple-crown map
/gsd-triple-crown artifacts
/gsd-triple-crown doctor
```

GSD 자체의 `/gsd-progress`를 대체하지 않습니다. 최신 GSD의 progress는
`--next`, `--do`, `--forensic`까지 제공하므로 GSD phase routing은 그대로
GSD가 소유하고, 이 guide는 Triple Crown의 외부 quality/release checkpoint를
추가로 보여줍니다.

빠른 참고: `WORKFLOW-QUICK-REFERENCE.md`  
상세 설명: `docs/WORKFLOW-GUIDE.md`

---

v0.6 changes the focus from **adding another workflow feature** to
**proving that the integration survives real upstream/runtime changes**.

Triple Crown remains:

```text
GSD          = Control Plane
gstack       = Product / Independent Quality Plane
Superpowers  = Executor Discipline Plane
Evidence     = Integrity Plane
```

v0.6 adds the fifth concern:

```text
Compatibility / E2E Plane
```

---

## Why v0.6 exists

v0.1–v0.5 established:

- one lifecycle owner;
- plan review boundary;
- selected Superpowers executor disciplines;
- mutation-aware external code review;
- evidence invalidation;
- report-only QA → GSD UAT gaps;
- dual security gates;
- hard GSD ship ownership;
- release/deployment SHA evidence;
- post-deployment Canary boundary.

Those contracts can still break when GSD, gstack, Superpowers, Claude Code,
Node, or their install layout changes.

v0.6 makes those assumptions executable.

---

## Test levels

### L0 — local/mock contract

```bash
node e2e/doctor.cjs --mock
node e2e/run-live.cjs --mock
python tests/run_local_smoke.py
```

Tests the **Triple Crown harness itself** and inherited deterministic contracts.

Mock GSD is deliberately not counted as real GSD compatibility evidence.

### L1 — real GSD install/render compatibility

```bash
node e2e/doctor.cjs
node e2e/run-live.cjs --keep
```

Creates a disposable project and runs the real:

```text
gsd init
gsd capability install ... --scope project --yes
gsd capability list
gsd loop render-hooks ...
```

It then asserts the exact Triple Crown hook graph.

### L2 — real Claude Code semantic acceptance

Use the kept fixture with real Claude Code, gstack, and Superpowers.

See:

```text
e2e/ACCEPTANCE-RUNBOOK.md
```

This level validates behavior that cannot be proven by manifest parsing:

- Superpowers does not steal lifecycle ownership;
- gstack review mutation is reconciled;
- qa-only remains report-only;
- browser findings enter GSD UAT gaps;
- CSO remains additive to GSD security;
- hard ship guard works during an actual session;
- deployment SHA gates Canary.

---

## Current upstream baseline

Captured 2026-08-19:

```text
GSD Core      1.10.0
gstack        1.67.2.0
Superpowers   6.3.0
```

Machine-readable:

```text
e2e/compatibility-baseline.json
```

### Important environment correction

Current GSD 1.10.0 package metadata requires:

```text
Node >= 24.0.0
npm  >= 10.0.0
```

The ChatGPT artifact runtime used to build this prototype has Node 22.16.0.

Therefore:

```text
L0 mock/contracts   PASS
L1 real GSD         NOT RUNNABLE HERE
L2 Claude semantics NOT RUNNABLE HERE
```

This is intentionally reported as environment readiness failure, not as a
Triple Crown compatibility pass.

Current environment result:

```text
e2e/LIVE-DOCTOR-RESULT.json
```

---

## Disposable fixture

`fixtures/demo-app` contains a tiny web app and a deliberate logout/session bug.

Purpose:

```text
review mutation path
OR
QA finding → UAT gap path
```

Both are valid L2 branches:
- if gstack review fixes it, mutation/evidence behavior is tested;
- if it reaches qa-only, QA→GSD gap behavior is tested.

The fixture is never intended for production.

---

## E2E files

```text
e2e/
├── compatibility-baseline.json
├── doctor.cjs
├── mock-gsd.cjs
├── assert-hooks.cjs
├── run-live.cjs
├── run-target.sh
├── run-target.ps1
├── COMPATIBILITY.md
├── CONTRACT-MATRIX.md
├── ACCEPTANCE-RUNBOOK.md
├── E2E-RESULT.json
└── LIVE-DOCTOR-RESULT.json
```

---

## Real target-machine command

Windows PowerShell:

```powershell
.\e2e\run-target.ps1
```

macOS/Linux:

```bash
./e2e/run-target.sh
```

The live runner uses a temporary fixture and does not modify your production
repository.

For L2, run:

```bash
node e2e/run-live.cjs --keep
```

and continue with `e2e/ACCEPTANCE-RUNBOOK.md`.

---

## Acceptance rule

Triple Crown v0.6.1 should be declared **runtime compatible** only when:

```text
L0 PASS
AND
L1 PASS using real current GSD
AND
L2 PASS using real Claude Code + gstack + Superpowers
```

A mock-only PASS must never be promoted to full compatibility.
