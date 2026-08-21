---
name: crew-gsd-release
description: Refresh GSD-owned release evidence after merge/deploy and conditionally run gstack canary, document-release, or retro.
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
Continue release observation **after** the initial GSD ship turn. This is the
manual bridge for events GSD ship cannot know at PR-creation time, especially
merge and deployment.
</objective>

<arguments>
Examples:

```text
/crew-gsd-release 3
/crew-gsd-release 3 --deployment-url https://app.example.com
/crew-gsd-release 3 --deployment-url https://app.example.com --deployed-sha abc123 --canary
/crew-gsd-release 3 --retro
/crew-gsd-release 3 --document
```
</arguments>

<process>

## 1. Resolve phase and refresh PR evidence

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

```bash
node "$CREW_CAP/checks/release-ledger.cjs" capture "$PHASE_DIR"
```

This refreshes PR open/merged state and effective release SHA.

## 2. Record deployment evidence when supplied

If `--deployment-url` is present:

```bash
node "$CREW_CAP/checks/release-ledger.cjs" record-deployment "$PHASE_DIR" \
  --status deployed \
  --url "<url>" \
  --sha "<--deployed-sha or current effectiveReleaseSha>" \
  --environment "<--environment or production>" \
  --source "release-observe"
```

The command records whether deployed SHA exactly matches the release SHA.

A mismatched deployment is not canary-ready.

## 3. `--document`

Document-release is allowed only while the GSD-created PR is OPEN.

Reason: the upstream skill commits and pushes to the current branch and edits the
PR body. Running it after merge would create a new branch commit that is not part
of the merged release.

If PR is open:
- use the same docs-session + docs-only authorization contract as
  `crew-gsd-postship`;
- re-capture release afterward.

If PR is merged/closed:
- do not invoke document-release;
- recommend a new GSD-controlled docs change/PR instead.

## 4. `--canary` or configured canary mode

Run `release-ledger ready`.

Only invoke native gstack canary when deployment evidence is deployed, has a URL,
and deployed SHA equals effective release SHA.

Use `--quick` unless the user explicitly asked for continuous monitoring or the
configured mode is `monitor-if-deployed`.

Normalize and finalize through `canary-session.cjs`.

## 5. `--retro`

Invoke native gstack retro using the configured/default 7d window.

Retro remains advisory and does not alter release validity.

## 6. Final report

Refresh RELEASE.json and report exact states:

```text
PR: open | merged | closed | unresolved
Release SHA: ...
Deployment: pending | deployed | failed | rolled_back | none
Deployment matches release: true | false
Canary: pass | alert | deferred | ...
Docs: pass | deferred | ...
Retro: pass | deferred | ...
```
</process>
