---
name: crew-gsd
description: Crew situational dashboard — show current progress, blockers, next action, help, recovery guidance, or integration health without taking lifecycle ownership from GSD.
argument-hint: "[status | next | resume | help [topic] | map | artifacts | doctor] [--phase N] [--json]"
effort: low
allowed-tools:
  - Read
  - Bash
  - Grep
  - Glob
---

<objective>
Keep the user oriented while a Crew project moves through GSD + gstack +
Superpowers.

This is a **read-only navigation skill**. It may inspect `.planning`, Crew
artifacts, installed capability files, and project hook configuration. It must not
execute lifecycle work, modify source, advance phases, run reviews, ship, or
silently resolve blockers.

GSD remains the lifecycle owner. When recommending continuation, prefer a GSD
command such as `/gsd-progress --next`, `/gsd-execute-phase`, `/gsd-verify-work`,
or `/gsd-ship`. Recommend a Crew adapter command only when the missing
checkpoint is specifically one of Crew's external quality/release adapters.
</objective>

<modes>
- **default / status** — current phase dashboard, stage statuses, blocker, and next command.
- **next** — show only the next recommended action plus prerequisite/reason.
- **resume** — show durable resume point: last completed checkpoint, current blocker, next action, and key artifact paths.
- **help [topic]** — concise topic help. Topics: workflow, plan, execute, review, qa, verify, security, ship, release, canary, gaps, recovery, e2e.
- **map** — full lifecycle map and ownership boundaries.
- **artifacts** — explain the important `.planning` artifacts and who owns each.
- **doctor** — project-level Crew installation/guard health. This is not the v0.6 host compatibility doctor.
</modes>

<process>
1. Resolve the capability directory:
   - project: `.gsd/capabilities/crew-guide`
   - global: `$HOME/.gsd/capabilities/crew-guide`
   - source-tree fallback: the directory containing this skill's capability
2. Invoke the deterministic guide:
   ```bash
   node "$CREW_CAP/checks/workflow-guide.cjs" $ARGUMENTS
   ```
3. Return its output without inventing status not present in the artifacts.
4. If the guide reports `UNKNOWN` or a missing artifact, explain that uncertainty;
   do not infer completion.
5. For general GSD situational routing, remind the user that native
   `/gsd-progress` remains authoritative for the GSD phase pipeline and supports
   `--next`, `--do`, and `--forensic`.
</process>
