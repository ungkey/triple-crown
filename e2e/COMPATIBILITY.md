# Crew v0.6 Compatibility Baseline

Captured: **2026-08-19**

The harness intentionally separates "known upstream version" from "supported range".

| Upstream | Observed baseline | Crew v0.6 contract |
|---|---:|---|
| GSD Core | 1.10.0 (`next`) | `>=1.10.0 <2.0.0` |
| gstack | 1.67.2.0 | required skill set + behavioral boundaries |
| Superpowers | 6.3.0 | required discipline skill set |

Machine-readable baseline:

```text
e2e/compatibility-baseline.json
```

## GSD runtime requirement

For v0.6, `doctor.cjs` treats the current GSD 1.10 package engine declaration as
the executable source of truth:

```text
Node >= 24.0.0
npm  >= 10.0.0
```

There is currently documentation in the upstream repository that still mentions
Node 18 for installation. The package manifest and the docs therefore disagree.
The harness fails closed on the package engine requirement because that is what
npm/runtime compatibility actually enforces.

## gstack contracts watched

v0.6 checks that these skills exist:

```text
plan-eng-review
review
qa-only
cso
canary
document-release
retro
```

The E2E runbook additionally verifies the integration assumptions:

```text
qa-only          = report-only, no source fix
canary           = live URL / post-deployment observer
document-release = may edit docs + commit + push + update PR
retro            = time-window engineering retrospective
```

If gstack keeps the skill name but changes one of those semantics, the structural
doctor can still pass. That is why L2 interactive acceptance exists.

## Superpowers contracts watched

Required skills:

```text
using-superpowers
test-driven-development
systematic-debugging
verification-before-completion
```

Crew deliberately does not require the full Superpowers lifecycle during
GSD execution. The compatibility contract is:

```text
GSD owns lifecycle/orchestration
Superpowers supplies selected executor disciplines
```

## Compatibility outcome classes

```text
PASS
  contract observed as expected

WARN
  optional host integration unavailable or upstream version drift exists

FAIL
  a load-bearing contract is missing/incompatible
```

Do not convert WARN into PASS automatically. A WARN may mean L2 cannot be run.
