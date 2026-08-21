# Security Contract v0.4

Crew uses two independent security layers.

## GSD native security

GSD owns its native planning threat model, `secure-phase`, canonical `SECURITY.md`,
and native `ship:pre` `threats_open == 0` gate.

Crew does not disable or replace this layer.

## gstack CSO

gstack adds an independent audit lens for secrets, dependency supply chain,
CI/CD, LLM/AI and skill supply chain, OWASP Top 10, STRIDE, and active verification.

## Risk-based trigger

A deterministic classifier assigns `low | medium | high` based on concrete phase
signals. It decides only whether the external audit should run, never whether the
code is secure.

Default:

```text
mode: risk-based
trigger_at: medium
audit_depth: daily
block_on: high
```

## External ship gate

`GSTACK-SECURITY.json` is bound to the exact workspace digest. Open findings at
or above `block_on` prevent ship. Resolved/accepted/closed/false-positive findings
do not count as open.

Any later source change makes the external security report stale and blocks ship.

Final ship therefore requires all active GSD gates plus the independent Crew security gate.
