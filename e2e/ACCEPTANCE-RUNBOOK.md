# Crew v0.6 E2E Acceptance Runbook

v0.6 has three test levels. Do not collapse them into one "all tests pass" claim.

---

# L0 — Harness sanity / mock GSD

Purpose:

```text
Does the Crew E2E harness itself work?
```

Run:

```bash
node e2e/doctor.cjs --mock
node e2e/run-live.cjs --mock
python tests/run_local_smoke.py
```

Expected:

```text
PASS hook contract
PASS ship guard contracts
PASS release/deployment contracts
```

**Not proven by L0:**

```text
real GSD installation
real GSD hook ordering
Claude Code Skill dispatch
gstack browser execution
Superpowers runtime invocation
GitHub PR creation
```

The mock must never be cited as evidence for those.

---

# L1 — Real GSD install + hook graph

Purpose:

```text
Does current GSD actually accept and activate Crew?
```

## Prerequisites

Current baseline requires:

```text
Node >= 24
npm  >= 10
Git
GSD >= 1.10.0 < 2.0.0
Claude Code
gstack
Superpowers
```

For real ship testing also:

```text
gh
GitHub authentication
disposable remote repository
```

First run:

```bash
node e2e/doctor.cjs
```

Do not continue until all load-bearing checks are PASS.

If installations live outside standard paths:

```bash
CREW_GSD_BIN=/path/to/gsd
CREW_GSTACK_HOME=/path/to/gstack
CREW_SUPERPOWERS_HOME=/path/to/superpowers/skills
```

Then execute:

```bash
node e2e/run-live.cjs --keep
```

The command creates a disposable fixture and verifies:

```text
gsd init
capability install --scope project --yes
capability list -> status active
.gsd/capabilities staging
plan:post hook
execute:wave:pre hook
execute:post quality chain ordering
verify:pre gates
ship:pre gates
ship:post release adapter
Claude project ship-guard installation
local adapter regression suite
```

Load-bearing expected hook graph:

```text
plan:post
  crew-quality plan-review gate

execute:wave:pre
  crew-discipline -> executor contribution

execute:post
  code-review
    -> qa-only
      -> cso

verify:pre
  evidence freshness
  QA freshness/UAT bridge

ship:pre
  external security gate
  GSD ship authorization arm

ship:post
  crew-gsd-postship
```

If this level fails, inspect:

```text
e2e/E2E-RESULT.json
```

The `failure.stage` field is intended to tell you whether the break is:
- environment;
- capability install/trust;
- activation;
- registry/hook schema;
- hook order;
- staging;
- ship guard.

---

# L2 — Real Claude Code + gstack + Superpowers acceptance


## Orientation check — use this throughout L2

At any point in the acceptance run, invoke:

```text
/crew-gsd
```

Acceptance:
- it derives the current phase from `.planning`, not chat memory;
- it shows the 10 Crew checkpoints;
- a blocked checkpoint is surfaced before later waiting checkpoints;
- `next` names the owning command without executing it;
- `/crew-gsd resume` returns the last durable artifact and restart point.

Use `/gsd-progress --forensic` when the underlying GSD state itself appears
inconsistent.


Purpose:

```text
Do the AI/runtime semantics still behave as Crew expects?
```

Use the fixture kept by L1.

## 1. Start fixture web app

In terminal A:

```bash
cd <fixture-path>
npm test
npm start
```

Expected URL:

```text
http://127.0.0.1:4173
```

The fixture intentionally contains a logout/session defect.

## 2. Start Claude Code

In terminal B:

```bash
cd <fixture-path>
claude
```

Confirm the GSD commands are available and inspect `/hooks` to confirm the
Crew Bash guard is active.

## 3. Validate executor policy

Ask GSD to work on the fixture phase using the normal GSD lifecycle.

Acceptance evidence should show that:
- GSD owns plan/execution scheduling;
- the executor does not start Superpowers brainstorming/writing-plans/SDD;
- TDD is used only when GSD classifies the task as TDD;
- systematic-debugging can be invoked for an actual failure;
- verification-before-completion uses fresh commands/evidence.

If Superpowers attempts to take ownership of worktrees/planning/ship, fail L2.

## 4. Validate gstack code-review bridge

At `execute:post`, confirm:

```text
GSTACK-CODE-REVIEW.json
MUTATION.json
EVIDENCE.json
```

If gstack modifies code:
- old evidence must become stale;
- post-review verification must be fresh;
- GSD verify must not proceed on stale evidence.

## 5. Validate gstack QA-only

The fixture app contains an intentional logout defect unless an earlier review
already corrected it.

Acceptance has two valid branches:

### Branch A — code review fixed it

Verify:
- mutation was detected;
- fresh verification was recorded;
- QA-only does not modify source.

### Branch B — defect reaches QA

Verify:
- gstack `qa-only` reports the logout defect;
- `GSTACK-QA.json` contains an issue;
- canonical `01-UAT.md` receives a managed QA test;
- `## Gaps` receives a stable `G-01-*` entry;
- no source code is changed by qa-only.

In both branches, any source mutation by qa-only is a failure.

## 6. Validate gap ownership

If QA produced a gap:

```text
GSD diagnosis
-> plan-phase --gaps
-> execute-phase --gaps-only
-> verify-work
```

gstack QA must not become a hidden fixer/orchestrator loop.

## 7. Validate security dual-gate

The fixture phase is auth/session-sensitive and should be classified high risk.

Verify:
- GSD native security remains active;
- gstack CSO produces `GSTACK-SECURITY.json` when policy triggers;
- an open high/critical CSO finding blocks the Crew ship gate;
- GSD native `SECURITY.md` can independently block.

## 8. Validate hard ship ownership

Before GSD ship authorization, ask for a direct push or try an alternate ship
path in the disposable fixture.

Expected:

```text
DENY — GSD owns ship
```

Then use the actual GSD ship workflow against a **disposable remote repository**.

Expected:
- GSD push allowed;
- one GSD PR creation allowed;
- alternate-session reuse denied;
- PR merge still denied by v0.6 policy;
- ship:post disarms main authorization.

Never run this portion against a production repository.

## 9. Validate release observation

After PR creation:

```text
RELEASE.json
```

must say `owner: gsd`.

Do not call PR creation "deployment".

Record a deployment only with a real URL + actual deployed SHA.

Canary acceptance requires:

```text
deployedSha == effectiveReleaseSha
```

If SHA differs, Canary must defer/refuse.

When matching, run the release observer with Canary and verify:

```text
GSTACK-CANARY.json
```

is bound to the same release/deployment SHA.

## 10. Document-release / Retro

Document-release:
- only while the GSD-created PR is open;
- docs-only authorization;
- no runtime source paths;
- VERSION denied unless explicitly enabled.

Retro:
- advisory;
- manual/weekly/sprint semantics by default;
- never a release validity gate.

---

# Acceptance decision

Declare v0.6 compatible only when:

```text
L0 PASS
AND L1 PASS on real GSD
AND L2 semantic acceptance PASS
```

A mock-only run is **not** a release acceptance.
