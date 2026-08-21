---
name: crew-gsd-qa
description: Run gstack qa-only after GSD execution, normalize browser QA evidence, and seed findings into GSD UAT gaps without modifying source code.
allowed-tools:
  - Bash
  - Read
  - Write
  - Glob
  - Grep
  - Skill
  - AskUserQuestion
---

<objective>
Run gstack's **report-only** `/qa-only` as an independent functional/browser QA
layer after code review. Convert the result into machine-readable evidence and
seed GSD's canonical UAT file so QA issues flow directly into
`/gsd:plan-phase --gaps`.
</objective>

<critical_rules>
1. Invoke the real installed gstack `qa-only` skill; do not emulate it.
2. Never invoke gstack `/qa` in this wrapper.
3. `qa-only` must not modify the reviewed project worktree.
4. Any project mutation during QA is a BLOCKED integration violation.
5. Never mark a scenario passed unless gstack produced direct evidence for it.
6. Uncovered user-visible SUMMARY deliverables become `manualTests`, not passes.
7. Do not overwrite existing GSD UAT user results; the bridge only manages its own QA blocks.
</critical_rules>

<process>

## 1. Resolve phase and capability

Resolve the capability directory in this order:

```bash
if [ -d ".gsd/capabilities/crew-quality" ]; then
  CREW_CAP=".gsd/capabilities/crew-quality"
elif [ -d "$HOME/.gsd/capabilities/crew-quality" ]; then
  CREW_CAP="$HOME/.gsd/capabilities/crew-quality"
elif [ -d "capabilities/crew-quality" ]; then
  CREW_CAP="capabilities/crew-quality"
else
  echo "BLOCKED: crew-quality capability directory not found"
  exit 1
fi
```

Use the first positional `$ARGUMENTS` token as a phase number/path when present.
Resolve it with:

```bash
PHASE_TOKEN=${PHASE_NUMBER:-$(printf '%s' "$ARGUMENTS" | awk '{print $1}')}
PHASE_DIR=$(node "$CREW_CAP/checks/lib/resolve-phase-dir.cjs" "$PHASE_TOKEN")
```

If phase resolution fails, stop with `BLOCKED` rather than guessing.

## 2. Capture report-only PRE state

```bash
node "$CREW_CAP/checks/qa-session.cjs" begin "$PHASE_DIR"
```

## 3. Invoke gstack qa-only

Read the configured skill id:

```bash
if command -v gsd-tools >/dev/null 2>&1; then
  QA_SKILL_ID=$(gsd-tools query config-get crew.gstack.qa_skill_id 2>/dev/null || echo "qa-only")
else
  QA_SKILL_ID="qa-only"
fi
```

Invoke that exact gstack QA skill with the host Skill tool.

Pass through useful target context from the current project/phase. If gstack asks
which URL/environment to test and it cannot infer one safely, let its normal
interactive workflow ask the user. Do not invent a deployment URL.

The native gstack contract is report-only: health score, screenshots/evidence,
reproduction steps, and findings, **no fixes**.

## 4. Normalize QA

Read all current `*-SUMMARY.md` files and the gstack QA result.

Write:

```text
$PHASE_DIR/.crew/qa-normalized.json
```

with this exact shape:

```json
{
  "schema": 1,
  "status": "pass | findings | blocked | unavailable",
  "target": "URL/environment or null",
  "healthScore": 0,
  "summary": "short factual summary",
  "tests": [
    {
      "fingerprint": "stable-kebab-or-hash",
      "name": "observable scenario",
      "expected": "what should happen",
      "result": "pass | issue | blocked | skipped",
      "reported": "actual/repro text when issue",
      "severity": "blocker | major | minor | cosmetic",
      "blockedBy": "server | physical-device | release-build | third-party | prior-phase | other",
      "reason": "optional"
    }
  ],
  "findings": [
    {
      "fingerprint": "same fingerprint as the matching issue test",
      "name": "bug title",
      "severity": "blocker | major | minor | cosmetic",
      "expected": "expected",
      "actual": "actual",
      "repro": "minimal reproduction"
    }
  ],
  "manualTests": [
    {
      "name": "SUMMARY deliverable not proven by qa-only",
      "expected": "user-observable expected behavior",
      "reason": "why browser QA did not prove it"
    }
  ],
  "evidence": [
    {
      "kind": "screenshot | browser | log | other",
      "ref": "path/id/description"
    }
  ]
}
```

Rules:
- Every `findings[]` item must have a matching `tests[]` item with `result: issue`.
- Use GSD UAT severity vocabulary: blocker / major / minor / cosmetic.
- A blocked external environment is `blocked`, not a code `issue`.
- Do not convert an assumption into `pass`.
- `manualTests` are only user-observable phase deliverables from SUMMARYs that
  were not actually exercised by qa-only.

## 5. Finalize QA and enforce no-mutation

```bash
node "$CREW_CAP/checks/qa-session.cjs" finalize \
  "$PHASE_DIR" \
  "$PHASE_DIR/.crew/qa-normalized.json"
```

Read `GSTACK-QA.json`.

If `unexpectedMutation: true`, return BLOCKED. Do not bridge the report into UAT.

If status is `blocked` or `unavailable`, return BLOCKED.

## 6. Seed/merge GSD UAT

Run:

```bash
node "$CREW_CAP/checks/uat-bridge.cjs" \
  "$PHASE_DIR" \
  "$PHASE_DIR/GSTACK-QA.json"
```

Behavior:
- if GSD UAT does not yet exist, create it using the official GSD UAT shape;
- import qa-only tested scenarios as pass/issue/blocked/skipped tests;
- convert QA issues to stable `G-{phase}-{test}` gaps;
- seed uncovered SUMMARY deliverables as pending manual tests;
- if native UAT already exists, preserve its tests/results and append only the
  managed QA block;
- reruns replace the prior managed QA block instead of duplicating it.

## 7. Deterministic self-check

```bash
node "$CREW_CAP/checks/qa-ready.cjs" "$PHASE_DIR"
```

If it fails, return BLOCKED.

Otherwise report:
- QA status and health score;
- target tested;
- number of QA tests/issues;
- number of manual tests seeded;
- UAT path;
- evidence references.

Do not fix QA findings here.

If QA issues exist, the next GSD UAT/diagnosis cycle owns root-cause diagnosis,
then `/gsd:plan-phase <phase> --gaps` consumes the same canonical UAT file.

End `DONE` or `DONE_WITH_CONCERNS`.
</process>
