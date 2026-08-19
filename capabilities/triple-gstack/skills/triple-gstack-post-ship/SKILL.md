---
name: gsd-triple-gstack-post-ship
description: GSD-owned post-ship release ledger plus conditional gstack document-release, canary, and retro adapters.
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
Run only after the **GSD ship workflow** has created the PR and updated shipping
state. Capture release evidence, disarm the main ship authorization, and run only
post-ship activities whose prerequisites are actually satisfied.

This skill does not create another PR and must never invoke gstack `/ship`.
</objective>

<critical_rules>
1. GSD is the sole PR/ship owner.
2. `ship:post` means "after PR creation", not "production deployed".
3. Never run canary without explicit deployment evidence matching the release SHA.
4. Never run document-release outside the narrow docs-only push authorization.
5. VERSION is not allowed in the docs-only push unless config explicitly permits it.
6. Retro is weekly/sprint-oriented; default is manual.
7. ship:post failures are advisory because the PR already exists.
</critical_rules>

<process>

## 1. Resolve phase and capability

Resolve `TC_GSTACK_CAP` and `PHASE_DIR` using the same pattern as other Triple Crown
skills.

## 2. Capture the GSD-created release

```bash
node "$TC_GSTACK_CAP/checks/release-ledger.cjs" capture "$PHASE_DIR"
```

Read `RELEASE.json`.

It should normally show:

```text
releaseState: pr_open
owner: gsd
```

immediately after `/gsd:ship`.

## 3. Disarm the main remote-effect authorization

GSD's own push/PR actions are complete before ship:post dispatch.

```bash
node "$TC_GSTACK_CAP/checks/ship-guard-control.cjs" disarm-gsd "$PHASE_DIR"
```

Do this before invoking any gstack post-ship skill.

## 4. Document-release adapter

Read:

```text
triple_crown.gstack.document_release_mode
triple_crown.gstack.document_release_skill_id
triple_crown.gstack.document_release_allow_version_bump
```

Defaults:

```text
mode = manual
skill = document-release
allow_version_bump = false
```

### `off`

Write `GSTACK-DOCUMENT-RELEASE.json` with status `skipped`.

### `manual`

Write `GSTACK-DOCUMENT-RELEASE.json` with status `deferred` and note that
`/gsd-triple-gstack-release-observe <phase> --document` can run it while the PR
is still open.

### `open-pr`

Run only when `RELEASE.json.pr.state == "OPEN"`.

If the PR is not open, record `deferred`; do not push a docs commit to a merged or
closed feature branch.

When eligible:

1. Start the mutation session:

```bash
node "$TC_GSTACK_CAP/checks/docs-release-session.cjs" begin "$PHASE_DIR" \
  [--allow-version when explicitly configured]
```

2. Arm the narrow docs-only push authorization:

```bash
node "$TC_GSTACK_CAP/checks/ship-guard-control.cjs" arm-docs "$PHASE_DIR" \
  [--allow-version when explicitly configured]
```

3. Invoke the real installed gstack `document-release` skill.

Important:
- The upstream skill may edit docs, commit, push, and update the existing PR body.
- If it asks whether to bump VERSION and version bump is not enabled, choose **Skip**.
- Do not broaden the allowlist to make an unexpected push pass.

4. Finalize:

```bash
node "$TC_GSTACK_CAP/checks/docs-release-session.cjs" finalize "$PHASE_DIR" \
  --status pass \
  --note "gstack document-release completed under docs-only authorization"
```

5. Always disarm docs authorization:

```bash
node "$TC_GSTACK_CAP/checks/ship-guard-control.cjs" disarm-docs "$PHASE_DIR"
```

6. Re-capture RELEASE.json because PR head may have changed:

```bash
node "$TC_GSTACK_CAP/checks/release-ledger.cjs" capture "$PHASE_DIR"
```

If finalization reports forbidden paths, record BLOCKED. Do not create another
ship path to work around the guard.

## 5. Canary adapter

Read:

```text
triple_crown.gstack.canary_mode
triple_crown.gstack.canary_skill_id
triple_crown.gstack.canary_duration
```

Run:

```bash
READY=$(node "$TC_GSTACK_CAP/checks/release-ledger.cjs" ready "$PHASE_DIR")
```

Canary may run only when `canaryReady == true`, meaning:

```text
deployment.status == deployed
deployment.url exists
deployment.deployedSha == RELEASE.effectiveReleaseSha
```

If not ready:
- write `GSTACK-CANARY.json` status `deferred`;
- state exactly which deployment evidence is missing;
- do not invent a production URL.

If mode is `off`, record `skipped`.

If ready:

1. Begin:

```bash
node "$TC_GSTACK_CAP/checks/canary-session.cjs" begin "$PHASE_DIR"
```

2. Invoke native gstack canary:
- `quick-if-deployed` → `<deployment-url> --quick`
- `monitor-if-deployed` → `<deployment-url> --duration <configured duration>`

3. Normalize the native result to:

```text
$PHASE_DIR/.triple-crown/canary-normalized.json
```

```json
{
  "schema": 1,
  "status": "pass | alert | blocked | unavailable",
  "mode": "quick | monitor",
  "summary": "factual result",
  "findings": [
    {
      "severity": "critical | high | medium | low",
      "page": "url",
      "type": "console | performance | page-failure | visual",
      "finding": "description"
    }
  ],
  "evidence": [
    {
      "kind": "screenshot | browser | metric",
      "ref": "path/id/description"
    }
  ]
}
```

4. Finalize:

```bash
node "$TC_GSTACK_CAP/checks/canary-session.cjs" finalize "$PHASE_DIR" \
  "$PHASE_DIR/.triple-crown/canary-normalized.json"
```

Canary is observational. Any source/git mutation is a BLOCKED adapter violation.

Canary alerts do not rewrite shipped code automatically. Surface them for an
incident/follow-up GSD phase.

## 6. Retro adapter

Read:

```text
triple_crown.gstack.retro_mode
triple_crown.gstack.retro_skill_id
triple_crown.gstack.retro_window
```

Default `manual`:

```bash
node "$TC_GSTACK_CAP/checks/retro-record.cjs" "$PHASE_DIR" deferred \
  "Retro is manual by default; run release-observe --retro at sprint/milestone boundary."
```

`off` → status `skipped`.

`every-ship` → invoke the native gstack retro with the configured window, then
record `pass` or `blocked`.

Do not make retro a prerequisite for release validity.

## 7. Final release capture

```bash
node "$TC_GSTACK_CAP/checks/release-ledger.cjs" capture "$PHASE_DIR"
```

Report:
- PR state/URL;
- effective release SHA;
- deployment evidence state;
- docs adapter status;
- canary status;
- retro status;
- whether the ship guard was disarmed.

Never report "deployed" unless RELEASE.json contains matching explicit deployment
evidence.
</process>
