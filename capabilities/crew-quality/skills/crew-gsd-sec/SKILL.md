---
name: crew-gsd-sec
description: Run a risk-based independent gstack CSO audit and normalize findings for the Crew ship gate.
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
Add an independent gstack CSO security lens without replacing GSD's native
security capability. GSD remains the lifecycle/security-policy owner; gstack CSO
adds infrastructure, supply-chain, OWASP, STRIDE, LLM/AI, and active-verification
coverage.
</objective>

<critical_rules>
1. GSD native `security` capability stays authoritative for its own SECURITY.md gate.
2. This wrapper produces separate `GSTACK-SECURITY.*` artifacts.
3. Never silently resolve or accept a security finding.
4. The CSO audit must not modify project source/git state.
5. A stale security audit cannot authorize ship.
</critical_rules>

<process>

## 1. Resolve phase/capability

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

## 2. Read Crew security config

Use `gsd-tools query config-get` when available; defaults:

```text
security_mode       = risk-based
security_trigger_at = medium
security_audit_depth= daily
security_skill_id   = cso
security_block_on   = high
```

## 3. Deterministic risk classification

Run:

```bash
RISK_JSON=$(node "$CREW_CAP/checks/security-risk.cjs" "$PHASE_DIR")
```

It classifies the phase `low | medium | high` from concrete phase/source boundary
signals such as:
- auth/authorization/session/permissions;
- payments/wallet/crypto/signing keys;
- secrets/PII/KYC;
- infrastructure/deployment/IAM;
- shell/exec/uploads/injection boundaries;
- external APIs/databases/webhooks;
- LLM/agent/tool trust boundaries.

This classifier decides only **whether to run the external audit**. It never
declares the code secure.

## 4. Decide audit applicability

If `security_mode=off`:
- do not invoke gstack CSO;
- create normalized status `off`.

If `security_mode=risk-based` and deterministic risk is below
`security_trigger_at`:
- do not invoke gstack CSO;
- create normalized status `not_applicable`;
- preserve risk signals and current workspace binding.

If `security_mode=always`, or risk meets the threshold:
- continue.

## 5. Capture PRE state

Always run before producing the final security artifact, including off/not-applicable:

```bash
node "$CREW_CAP/checks/security-session.cjs" begin "$PHASE_DIR"
```

## 6. Invoke real gstack CSO when applicable

Invoke the configured gstack CSO skill through the host Skill tool.

Request the configured audit depth (`daily` or `comprehensive`) in the skill args
where supported. Follow the native CSO workflow completely.

Current gstack CSO is an infrastructure-first audit covering secrets archaeology,
dependency supply chain, CI/CD security, LLM/AI and skill supply chain, OWASP Top
10, STRIDE, and active verification.

## 7. Normalize findings

Write:

```text
$PHASE_DIR/.crew/security-normalized.json
```

Shape:

```json
{
  "schema": 1,
  "status": "pass | findings | blocked | unavailable | not_applicable | off",
  "mode": "risk-based | always | off",
  "auditDepth": "daily | comprehensive",
  "risk": "low | medium | high",
  "riskSignals": [{"level":"high","label":"identity/access"}],
  "blockOn": "critical | high | medium | low | none",
  "summary": "short factual summary",
  "findings": [
    {
      "id": "SEC-001",
      "severity": "critical | high | medium | low | info",
      "status": "open | resolved | accepted | false_positive",
      "title": "finding title",
      "description": "verified issue",
      "remediation": "recommended remediation",
      "evidence": ["file:line or command evidence"]
    }
  ]
}
```

Do not mark a finding `resolved`, `accepted`, or `false_positive` unless that
disposition actually occurred.

For `off`/`not_applicable`, findings must be empty.

## 8. Finalize and bind audit to workspace

```bash
node "$CREW_CAP/checks/security-session.cjs" finalize \
  "$PHASE_DIR" \
  "$PHASE_DIR/.crew/security-normalized.json"
```

If `unexpectedMutation: true`, return BLOCKED.

## 9. Report

Report:
- deterministic phase risk;
- whether CSO was invoked and why;
- audit depth;
- findings by severity;
- ship blocking threshold;
- unresolved blocking findings.

Do not declare ship approved. `ship:pre` runs the deterministic
`security-ready.cjs` gate, and GSD's native security gate may independently block.

End `DONE` or `DONE_WITH_CONCERNS`; `BLOCKED` for unavailable required audit,
audit failure, or mutation.
</process>
