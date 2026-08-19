## Triple Crown Development Ownership

The human has explicitly chosen this routing policy for projects controlled by GSD.

### Detect controlled mode

When `.planning/STATE.md` exists (or an active GSD phase is otherwise established),
treat the project as **GSD_CONTROLLED**.

### In GSD_CONTROLLED mode, GSD is the sole lifecycle owner

GSD owns:
- requirements/roadmap/phase state;
- planning and plan revision;
- subagent spawning;
- dependency and wave scheduling;
- worktree/workspace isolation;
- phase verification and gap closure;
- branch/PR/ship lifecycle.

Do not start a second orchestration lifecycle inside a GSD task.

### Superpowers routing

The human explicitly authorizes these Superpowers engineering disciplines inside
GSD executors:
- `test-driven-development` when the approved GSD plan classifies the work as TDD;
- `systematic-debugging` on failures/unexpected behavior;
- `verification-before-completion` before any completion claim.

In GSD_CONTROLLED mode, do **not** automatically invoke:
- `brainstorming`;
- `writing-plans`;
- `subagent-driven-development`;
- `executing-plans`;
- `dispatching-parallel-agents`;
- `using-git-worktrees`;
- `finishing-a-development-branch`.

These responsibilities are already owned by GSD.

### gstack routing

Before GSD project initialization:
- use gstack `/office-hours` and product review where useful.

After GSD creates an approved PLAN:
- run gstack `/plan-eng-review` interactively when the Triple Crown plan-review
  gate requests it;
- after the interactive review is complete and the PLAN is settled, run the
  marker command printed by the gate.

In GSD_CONTROLLED mode:
- do not automatically invoke gstack `/ship`;
- GSD owns ship;
- gstack `/review` may run at GSD `execute:post` through the Triple Crown wrapper;
- that wrapper must snapshot PRE/POST repository state, invalidate stale evidence,
  and require fresh verification when review mutates source/git state;
- `/qa-only` and `/cso` remain deferred to the next integration slice.

### Authority order

1. REQUIREMENTS.md
2. approved product/design decisions
3. CONTEXT.md
4. approved PLAN.md
5. executor policy
6. execution/review evidence
7. session memory

A lower-authority skill may raise a finding, but it may not silently overwrite a
higher-authority decision.


### Triple Crown v0.4 QA and security

After successful mutation-aware gstack code review:
- run report-only gstack `qa-only`, never `qa`, in the default lifecycle;
- bind QA evidence to the current workspace;
- seed QA issues into the canonical GSD UAT `## Gaps` structure;
- leave source remediation to GSD gap planning/execution.

Run gstack CSO as an independent security lens according to Triple Crown risk
classification. Do not disable or replace GSD's native security capability.
Both GSD SECURITY.md and GSTACK-SECURITY.json may independently block ship.

A QA or security report from a different workspace digest is stale and must not
authorize verification or shipping.


### Triple Crown v0.5 ship ownership

When `.planning/STATE.md` exists:

- GSD is the only workflow allowed to create/push the release PR.
- Never invoke gstack `/ship`; route ship/create-PR/deploy requests to GSD ship.
- Project Claude Code installs a `PreToolUse(Bash)` ship guard that blocks
  un-authorized `git push`, `gh pr create`, `gh pr merge`, and GitLab equivalents.
- GSD `ship:pre` arms a short-lived authorization; `ship:post` disarms it.
- gstack document-release may receive a separate docs-only push authorization
  while the GSD-created PR is open.
- Canary requires explicit deployment evidence whose deployed SHA equals the
  effective GSD release SHA.
- A PR being created is not proof of deployment.


### Triple Crown v0.6.1 workflow orientation

When the user asks any equivalent of:
- "where are we?"
- "what is done?"
- "what is next?"
- "why are we blocked?"
- "how do I resume?"
- "show Triple Crown status/help"

do not reconstruct lifecycle state from chat memory.

Prefer the read-only Triple Crown guide:

```text
/gsd-triple-crown
/gsd-triple-crown next
/gsd-triple-crown resume
/gsd-triple-crown help <topic>
```

The guide reads durable `.planning` / Triple Crown artifacts and recommends the
owning command. It does not execute lifecycle work.

For canonical GSD-only progress/routing, `/gsd-progress` remains authoritative
and may be used with `--next`, `--do`, or `--forensic`.


### Navigation footer after major checkpoints

After a major user-visible checkpoint completes (plan approval, execution,
review, QA, verification/gap closure, security, ship, deployment evidence, or
Canary), finish the response with a short orientation footer when practical:

```text
Checkpoint: <completed/current checkpoint>
Next owner: <GSD | gstack adapter | release observer>
Next: <exact command or prerequisite>
```

Derive this from durable artifacts or `/gsd-triple-crown`, not from conversational
memory. Do not auto-run the next lifecycle command merely to produce the footer.
