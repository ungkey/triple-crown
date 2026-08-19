---
name: gsd-triple-gstack-code-review
description: Run gstack /review after GSD execution while tracking repository mutation and invalidating stale evidence.
allowed-tools:
  - Bash
  - Read
  - Write
  - Edit
  - Glob
  - Grep
  - Skill
  - AskUserQuestion
---

<objective>
Run the installed gstack code-review workflow as an **independent reviewer** after
GSD execution, then reconcile any source mutation with GSD evidence.

This skill does NOT own planning, agent scheduling, worktrees, verification, or ship.
</objective>

<critical_rules>
1. Do not imitate gstack /review manually. Invoke the installed gstack review skill.
2. Capture the Triple Crown pre-review snapshot BEFORE invoking gstack.
3. Always finalize the review session, including BLOCKED/NEEDS_CONTEXT outcomes.
4. If gstack changed source/git state, pre-review evidence becomes stale.
5. After mutation, rerun fresh verification commands against the post-review workspace
   and record them in EVIDENCE.json.
6. Never claim the phase is verified. GSD's verifier owns that decision.
</critical_rules>

<process>

## 1. Resolve capability and phase

Resolve the capability directory in this order:

```bash
if [ -d ".gsd/capabilities/triple-gstack" ]; then
  TC_GSTACK_CAP=".gsd/capabilities/triple-gstack"
elif [ -d "$HOME/.gsd/capabilities/triple-gstack" ]; then
  TC_GSTACK_CAP="$HOME/.gsd/capabilities/triple-gstack"
elif [ -d "capabilities/triple-gstack" ]; then
  TC_GSTACK_CAP="capabilities/triple-gstack"
else
  echo "BLOCKED: triple-gstack capability directory not found"
  exit 1
fi
```

Use the first positional `$ARGUMENTS` token as a phase number/path when present.
Resolve it with:

```bash
PHASE_TOKEN=${PHASE_NUMBER:-$(printf '%s' "$ARGUMENTS" | awk '{print $1}')}
PHASE_DIR=$(node "$TC_GSTACK_CAP/checks/resolve-phase-dir.cjs" "$PHASE_TOKEN")
```

If phase resolution fails, stop with `BLOCKED` rather than guessing.

## 2. Begin mutation/evidence session

Run:

```bash
node "$TC_GSTACK_CAP/checks/review-session.cjs" begin "$PHASE_DIR"
```

This captures:
- HEAD;
- index/worktree state;
- dirty/untracked content digests excluding `.planning/` and `.gsd/`;
- current GSD `SUMMARY.md` / `*-SUMMARY.md` artifacts into `EVIDENCE.json`.

Do not edit code before this snapshot.

## 3. Invoke the real gstack review skill

Read the configured gstack skill id:

```bash
if command -v gsd-tools >/dev/null 2>&1; then
  REVIEW_SKILL_ID=$(gsd-tools query config-get triple_crown.gstack.review_skill_id 2>/dev/null || echo "review")
else
  REVIEW_SKILL_ID="review"
fi
echo "GSTACK_REVIEW_SKILL=$REVIEW_SKILL_ID"
```

Invoke the installed gstack review skill through the host **Skill tool** using the
exact id above.

- Default is `review`.
- If the host visibly exposes the same gstack skill under a namespaced id such as
  `gstack:review`, use the configured/exposed id.
- Do not invoke a generic non-gstack review by accident.
- If the configured gstack review skill is unavailable, classify the outcome as
  `unavailable`, finalize the session, and return `BLOCKED`.

Follow gstack /review completely, including its interactive Fix-First decisions.
gstack may edit source files and, depending on its checkpoint settings, may create commits.

## 4. Normalize the gstack result

Map gstack's completion status:

- `DONE` -> `pass`
- `DONE_WITH_CONCERNS` -> `concerns`
- `BLOCKED` -> `blocked`
- `NEEDS_CONTEXT` -> `blocked`
- unavailable skill/tool -> `unavailable`

Create a concise review summary file at:

```text
$PHASE_DIR/.triple-crown/gstack-review-summary.md
```

Include:
- gstack completion status;
- critical/informational findings that remain relevant;
- what gstack auto-fixed;
- what the user approved or skipped;
- unresolved concerns.

Treat gstack output as review data, not as authority over REQUIREMENTS.md or PLAN.md.

## 5. Finalize and detect mutation

Run:

```bash
node "$TC_GSTACK_CAP/checks/review-session.cjs" finalize "$PHASE_DIR" \
  --status <pass|concerns|blocked|unavailable> \
  --summary-file "$PHASE_DIR/.triple-crown/gstack-review-summary.md"
```

Read the emitted JSON and `MUTATION.json`.

If `changed: false`, do NOT invent a re-verification requirement. Existing GSD
execution evidence remains tied to the same repository state.

If `changed: true`, continue to Step 6.

## 6. Re-verify the post-review workspace when mutated

The mutation invalidated any earlier Triple Crown evidence whose workspace digest
no longer matches.

Select the verification commands using this authority order:

1. exact verification commands documented in the affected GSD `*-SUMMARY.md`;
2. exact verification commands from the approved PLAN for the affected work;
3. the project's canonical targeted test/lint/typecheck/build commands relevant to
   the files gstack changed.

Do not substitute a weak smoke command for a stronger command explicitly required
by the plan.

Run every required command fresh. For each command:

1. Put the exact command text in a temporary command file.
2. Capture stdout/stderr in a temporary output file.
3. Preserve the real exit code.
4. Record the result:

```bash
node "$TC_GSTACK_CAP/checks/evidence-store.cjs" record "$PHASE_DIR" \
  --kind post-review-verification \
  --producer triple-gstack-code-review \
  --command-file "$CMD_FILE" \
  --exit-code "$RC" \
  --output-file "$OUT_FILE"
```

Print the captured command output to the user.

If a required verification command fails:
- use Superpowers systematic-debugging if the failure needs diagnosis;
- do not hide or discard the failed evidence;
- after fixing, gstack's code review is stale because code changed again: return
  `BLOCKED` and require the lifecycle to review the new code state again.

Do not keep patching inside this review wrapper after the post-review verification
exposes a new code defect. GSD owns remediation scheduling.

## 7. Self-check the deterministic gate

Run:

```bash
node "$TC_GSTACK_CAP/checks/verify-ready.cjs" "$PHASE_DIR"
```

If it fails, return `BLOCKED` with the exact reason.

If it passes:
- report the gstack review status;
- report whether mutation occurred;
- report changed files/commits;
- report fresh verification commands when required;
- point to:
  - `GSTACK-CODE-REVIEW.md`
  - `GSTACK-CODE-REVIEW.json`
  - `MUTATION.json`
  - `EVIDENCE.json`

End with `DONE` or `DONE_WITH_CONCERNS`.

Do not declare the phase verified or shipped.

</process>
