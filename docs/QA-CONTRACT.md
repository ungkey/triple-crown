# QA Contract v0.4

gstack `/qa-only` is the report-only QA workflow. Crew treats any project
worktree mutation during qa-only as a contract violation.

## Canonical QA artifact

```text
GSTACK-QA.json
```

It records status, target, health score, tested scenarios, findings, evidence, and
the exact workspace digest.

## GSD UAT bridge

QA results are copied into the canonical GSD UAT structure:

```text
pass    -> result: pass
issue   -> result: issue + ## Gaps entry
blocked -> result: blocked
skipped -> result: skipped
```

QA issue severity is normalized to:

```text
blocker | major | minor | cosmetic
```

Each issue gets a stable GSD-style:

```text
gap_id: G-{phase}-{test-number}
```

## Manual coverage

When no UAT exists yet, uncovered user-visible SUMMARY deliverables are inserted
as `result: [pending]`; they are never silently marked passed.

When a native UAT already exists, the bridge preserves native results and only
replaces Crew managed QA blocks on rerun.

## Verify gate

`qa-ready.cjs` blocks only when QA evidence is unusable: missing, unavailable,
mutating, stale, or not bridged. Actual QA findings are allowed through because
they are already represented as canonical GSD UAT gaps for diagnosis and
`plan-phase --gaps`.
