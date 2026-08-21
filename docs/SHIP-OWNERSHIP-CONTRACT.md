# Ship Ownership Contract v0.5

## Canonical owner

When `.planning/STATE.md` exists:

```text
PR / remote ship owner = GSD
```

gstack `/ship` is not part of the Crew lifecycle for that project.

## Why prompt routing alone is insufficient

`CLAUDE.md` expresses intent, but a model can still choose the wrong tool/skill.

v0.5 adds a Claude Code `PreToolUse(Bash)` hook so remote effects are checked
deterministically before execution.

Protected effects:

```text
git push
gh pr create
gh pr merge
glab mr create
glab mr merge
```

## GSD ship authorization

At `ship:pre`, Crew writes:

```text
.planning/.crew/ship-auth.json
```

It contains:

```text
owner: gsd
branch
phase
expiry
action limits
bound Claude session id (after first protected action)
```

The first protected command binds the short-lived authorization to one Claude
session. Later protected actions from another session are denied.

Current limits are deliberately narrow:

```text
git push: up to 4
PR create: 1
PR merge: 0
```

The push allowance covers current GSD ship behavior, including its later STATE.md
ship-note/recovery pushes.

## PR merge

v0.5 does not authorize PR merge.

GSD ship creates and prepares the PR; merge policy remains explicit/external.
A future capability may introduce a separate merge authorization.

## gstack document-release exception

`document-release` may need to push a documentation commit into the **existing
GSD-created open PR**.

That is not a second ship owner. It runs under:

```text
owner: gsd-post-ship
kind: gstack-document-release
```

with a strict path allowlist.

If runtime/non-doc files appear in the new commit range, the push is denied.

## VERSION

VERSION is denied by default because it may affect build/runtime packaging.

If the user explicitly enables version bump support, the docs authorization may
include `VERSION`. That should be treated as a higher-risk release-policy choice.

## Fail-closed conditions

Remote effects are denied when:

- GSD project detected but no authorization exists;
- authorization expired;
- authorization is bound to another session;
- branch changed;
- action count exhausted;
- document-release contains non-authorized paths;
- PR merge is attempted.

## Claude Code enforcement

The shareable project setting is installed in:

```text
.claude/settings.json
```

and invokes:

```text
.claude/hooks/crew-ship-guard.cjs
```

Use `scripts/install-claude-ship-guard.cjs` to merge it into an existing project
without replacing unrelated settings.
