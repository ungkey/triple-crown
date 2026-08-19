# Post-Ship Adapter Contract v0.5

## Important semantic boundary

GSD `ship:post` runs after the PR has been created and shipping state is recorded.

It is **not** a guaranteed post-merge or post-deployment event.

Therefore every adapter is prerequisite-driven.

## document-release

Default:

```text
mode = manual
```

Optional automatic mode:

```text
open-pr
```

It may run only while the GSD-created PR is OPEN.

Reason: the upstream workflow edits documentation, creates a docs commit, pushes
the current branch, and updates the existing PR body.

It runs inside the docs-only push authorization.

After the skill returns:
- changed paths are revalidated;
- docs authorization is disarmed;
- RELEASE.json is recaptured.

## canary

Default:

```text
quick-if-deployed
```

But "if deployed" is a hard prerequisite, not a guess.

If deployment evidence is absent at ship:post, the result is `deferred`.

Later:

```text
release-observe --deployment-url ... --canary
```

can record the deployment and run Canary.

Canary is observational; any repository mutation during Canary is an adapter
contract violation.

## retro

Default:

```text
manual
```

gstack retro analyzes a time window (default 7 days) and persistent project
history. It is not a release validity gate.

Recommended triggers:
- sprint end;
- milestone end;
- weekly engineering review.

## ship:post failure semantics

Current GSD treats ship:post hooks as additive/best-effort. A failure does not
revoke the PR that was already created.

Triple Crown therefore records failures in artifacts and reports them rather than
pretending the original ship did not occur.
