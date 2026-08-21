# Crew v0.6.5 — One-command Installer + Workflow Guide

## Install

Repository: <https://github.com/ungkey/triple-crown>

### Requirements

```text
Node   >= 24   (current GSD 1.10 requirement)
git
Claude Code
```

GSD and gstack are bootstrapped automatically when missing. gstack setup
additionally needs [Bun](https://bun.sh). Superpowers is installed separately
from inside Claude Code:

```text
/plugin install superpowers@claude-plugins-official
```

### Install into a project — one command

Run this **from the project you want Crew to manage** (the installer
targets the current git root):

```bash
npx --yes github:ungkey/triple-crown#v0.6.5 install --yes
```

Target a different directory without changing shell:

```bash
npx --yes github:ungkey/triple-crown#v0.6.5 install --yes --project /path/to/your/project
```

If your npx version cannot infer the binary from the repository name, name the
package and the binary explicitly:

```bash
npx --yes --package github:ungkey/triple-crown#v0.6.5 crew install --yes
```

### Install from a clone

```bash
git clone https://github.com/ungkey/triple-crown.git
cd /path/to/your/project
bash /path/to/crew/install.sh --yes
```

`install.sh` runs the adjacent checkout directly, so no network fetch happens in
this form.

### Install via the bootstrap script

macOS / Linux — run from the target project:

```bash
curl -fsSL https://raw.githubusercontent.com/ungkey/triple-crown/v0.6.5/install.sh | bash -s -- --yes
```

Windows PowerShell — run from the target project:

```powershell
irm https://raw.githubusercontent.com/ungkey/triple-crown/v0.6.5/install.ps1 -OutFile install.ps1
.\install.ps1 --yes
```

Both default to `ungkey/triple-crown` and honour `CREW_REF` to select a
branch or tag (default: the shipped release tag), `CREW_REPO` to point at a fork, and
`CREW_NPM_PACKAGE` to use an npm registry package instead.

### Install from a packed tarball

```bash
npm pack                     # in a clone -> crew-harness-0.6.5.tgz
npx --yes --package ./crew-harness-0.6.5.tgz crew install --yes
```

The npm registry package is not published; GitHub is the distribution channel.

### What the installer does

```text
GSD/gstack prerequisite detection/bootstrap
→ stable .crew source copy
→ crew-discipline
→ crew-quality
→ crew-ship
→ crew-guide
→ .claude/skills (6 Crew skills)
→ CLAUDE.md routing
→ Claude ship guard
→ activation verification
```

Capabilities are installed **project-scoped**, so their gates never fire in other
repositories. Skills are copied into the target project's own `.claude/skills/`
directory, which is what makes them visible to Claude Code — a GSD capability
install alone never reaches a skills root. See `docs/V0.6.4-HOTFIX.md`.

### Verify

```bash
npx --yes github:ungkey/triple-crown#v0.6.5 doctor
```

`skills-installed` must be `PASS`. Then start a new Claude Code session in the
project and run:

```text
/crew-gsd
```

It shows the current workflow position and the next action.

### Update / uninstall

```bash
npx --yes github:ungkey/triple-crown#v0.6.5 install --yes      # re-run to update in place
npx --yes github:ungkey/triple-crown#v0.6.5 uninstall --yes
```

Uninstall removes only Crew's own capability registrations, `.crew/`,
its marked skills, its `CLAUDE.md` block, and its ship-guard hook. GSD, gstack,
and Superpowers are left installed.

Full installer documentation: `docs/INSTALLER.md`.

---

## 작업 중 길을 잃지 않기 위한 Workflow Guide

v0.6.1은 E2E harness 위에 **read-only situational UX**를 추가합니다.

가장 먼저 기억할 명령은 하나입니다.

```text
/crew-gsd
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
/crew-gsd next
/crew-gsd resume
/crew-gsd help workflow
/crew-gsd help recovery
/crew-gsd map
/crew-gsd artifacts
/crew-gsd doctor
```

GSD 자체의 `/gsd-progress`를 대체하지 않습니다. 최신 GSD의 progress는
`--next`, `--do`, `--forensic`까지 제공하므로 GSD phase routing은 그대로
GSD가 소유하고, 이 guide는 Crew의 외부 quality/release checkpoint를
추가로 보여줍니다.

빠른 참고: `WORKFLOW-QUICK-REFERENCE.md`  
상세 설명: `docs/WORKFLOW-GUIDE.md`

---

v0.6 changes the focus from **adding another workflow feature** to
**proving that the integration survives real upstream/runtime changes**.

Crew remains:

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

Tests the **Crew harness itself** and inherited deterministic contracts.

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

It then asserts the exact Crew hook graph.

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
Crew compatibility pass.

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
├── E2E-RESULT.json          (generated by run-live.cjs; untracked)
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

Crew v0.6.1 should be declared **runtime compatible** only when:

```text
L0 PASS
AND
L1 PASS using real current GSD
AND
L2 PASS using real Claude Code + gstack + Superpowers
```

A mock-only PASS must never be promoted to full compatibility.
