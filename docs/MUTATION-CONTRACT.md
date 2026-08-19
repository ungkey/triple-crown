# Mutation Contract v0.3

External review tools may modify code. Triple Crown treats that as a state transition,
not as an incidental side effect.

## PRE snapshot

Before `gstack /review`:

```text
HEAD
branch
index diff digest
unstaged diff digest
dirty tracked files
untracked non-ignored files
content digests
workspace digest
```

`.planning/**` and `.gsd/**` are excluded so Triple Crown's own bookkeeping does
not make its snapshot self-invalidating.

## POST snapshot

The same snapshot is captured after gstack review.

## Mutation predicate

```text
PRE.workspaceDigest != POST.workspaceDigest
```

This detects:

- uncommitted source edits;
- staged edits;
- new non-ignored files;
- deletions;
- gstack checkpoint commits / HEAD changes.

## Normalized artifact

```text
MUTATION.json
```

contains:

```json
{
  "schema": 1,
  "source": "gstack/review",
  "changed": true,
  "changedFiles": ["src/auth.ts"],
  "commits": ["..."],
  "headChanged": false,
  "preSnapshot": {},
  "postSnapshot": {},
  "invalidation": {},
  "freshVerificationRequired": true
}
```

## Consequences of mutation

When changed:

```text
1. prior Triple Crown evidence is compared with POST workspace digest;
2. non-matching current evidence becomes stale;
3. fresh post-review verification becomes mandatory;
4. GSD verify is blocked until fresh evidence is green.
```

## Review staleness

Even after fresh verification, the gstack review itself is valid only for its
recorded post-review workspace digest.

If code changes again:

```text
current.workspaceDigest != GSTACK-CODE-REVIEW.postSnapshot.workspaceDigest
```

`verify:pre` blocks and requires gstack review again.

This prevents:

```text
review A
-> code B
-> verify using review A
```

## Remediation boundary

If post-review verification exposes a new defect, the wrapper should not silently
enter an unlimited repair loop.

Recommended flow:

```text
gstack review mutation
-> fresh verification fails
-> record failed evidence
-> BLOCKED
-> GSD remediation / execution
-> gstack re-review
-> fresh verification
-> GSD verify
```

This preserves one orchestration owner.
