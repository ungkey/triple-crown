# EVIDENCE Contract v0.3

`EVIDENCE.json` is the Triple Crown machine-readable evidence ledger for one GSD phase.

## Location

```text
.planning/phases/<phase>/EVIDENCE.json
```

## Schema

```json
{
  "schema": 1,
  "phaseDir": "...",
  "createdAt": "...",
  "updatedAt": "...",
  "records": [],
  "invalidations": []
}
```

## Evidence record

```json
{
  "id": "EV-...",
  "kind": "post-review-verification",
  "producer": "triple-gstack-code-review",
  "status": "passed",
  "validity": "current",
  "createdAt": "...",
  "artifact": null,
  "artifactDigest": null,
  "command": "npm test",
  "exitCode": 0,
  "outputDigest": "sha256:...",
  "note": null,
  "snapshot": {
    "head": "<git sha>",
    "workspaceDigest": "sha256:..."
  }
}
```

## Status vs validity

These are intentionally separate.

`status` answers:

```text
Did the evidence-producing action pass?
```

Values used by v0.3:

```text
observed
passed
failed
```

`validity` answers:

```text
Does this evidence still describe the current code state?
```

Values:

```text
current
stale
```

A test can have:

```text
status = passed
validity = stale
```

That means it passed previously but can no longer prove the current workspace.

## GSD summary seeding

Before gstack review, v0.3 records the phase's current:

```text
SUMMARY.md
*-SUMMARY.md
```

as `gsd-summary-artifact` evidence with the current workspace digest.

This does not claim the summary itself is a passing test. It records that the
existing GSD execution report belonged to the pre-review code state.

## Invalidation

When an external reviewer changes source/git state:

```text
record.snapshot.workspaceDigest != postReview.workspaceDigest
```

all matching `current` evidence becomes `stale`.

An invalidation record is appended:

```json
{
  "id": "INV-...",
  "at": "...",
  "source": "gstack/review",
  "reason": "...",
  "targetSnapshot": {
    "head": "...",
    "workspaceDigest": "sha256:..."
  },
  "staleRecordIds": ["EV-..."]
}
```

## Fresh verification after mutation

If `MUTATION.json.changed == true`, `verify:pre` requires at least one
`post-review-verification` record that:

1. was recorded after the mutation invalidation;
2. matches the exact current workspace digest;
3. is the latest record for that exact command;
4. has `status=passed`;
5. has `exitCode=0`.

If multiple distinct commands were recorded, the latest result for **every**
recorded command must be green.

## Why command grouping matters

Example:

```text
npm test -> failed
npm test -> passed
npm run lint -> failed
```

The latest `npm test` result supersedes the earlier failure for gate purposes,
but the distinct `npm run lint` failure still blocks verification.

## Evidence is not phase verification

Passing evidence only means:

```text
the declared check passed on this exact workspace state
```

GSD's verifier still owns:

```text
did the phase actually satisfy its requirements and goal?
```
