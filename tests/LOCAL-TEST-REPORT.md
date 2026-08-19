# v0.5 Local Test Report

## Environment

- Python: `3.13.5`
- Node: `v22.16.0`
- Git: `git version 2.47.3`

## Structural validation

```text
PASS: triple-superpowers
PASS: triple-gstack
PASS: v0.5 structure / ship ownership / post-ship wiring
Spreadsheet runtime warmup failed during python startup
Traceback (most recent call last):
  File "/tmp/tmp.L2TH2Y5coc/artifact_tool_v2-2.8.22/artifact_tool/patches/warm_spreadsheet_runtime_on_startup.py", line 26, in warm_spreadsheet_runtime_on_startup
  File "/tmp/tmp.L2TH2Y5coc/artifact_tool_v2-2.8.22/artifact_tool/spreadsheet_warmup.py", line 785, in warm_spreadsheet_runtime
  File "/tmp/tmp.L2TH2Y5coc/artifact_tool_v2-2.8.22/artifact_tool/spreadsheet_warmup.py", line 720, in _warm_feature_flows
  File "/tmp/tmp.L2TH2Y5coc/artifact_tool_v2-2.8.22/artifact_tool/spreadsheet_warmup.py", line 704, in _warm_collaboration_flows
  File "/tmp/tmp.L2TH2Y5coc/artifact_tool_v2-2.8.22/artifact_tool/generated/interface/models.py", line 32317, in hydrate_crdt_from_proto
  File "/tmp/tmp.L2TH2Y5coc/artifact_tool_v2-2.8.22/artifact_tool/rpc/remote.py", line 749, in __call__
  File "/tmp/tmp.L2TH2Y5coc/artifact_tool_v2-2.8.22/artifact_tool/rpc/client.py", line 150, in call
artifact_tool.rpc.client.RemoteError: hydrateCrdtFromProto requires an empty collaborative document.
```

Result: **PASS**

## Executable smoke

```text
PASS guard-installer-idempotent
PASS gsd-ship-authorization/session/action-limits
PASS docs-only-push-allowlist
PASS release/deployment-sha-binding
PASS canary-matching-deployment
PASS document-release-post-mutation-check
PASS v0.5 executable smoke
Spreadsheet runtime warmup failed during python startup
Traceback (most recent call last):
  File "/tmp/tmp.L2TH2Y5coc/artifact_tool_v2-2.8.22/artifact_tool/patches/warm_spreadsheet_runtime_on_startup.py", line 26, in warm_spreadsheet_runtime_on_startup
  File "/tmp/tmp.L2TH2Y5coc/artifact_tool_v2-2.8.22/artifact_tool/spreadsheet_warmup.py", line 785, in warm_spreadsheet_runtime
  File "/tmp/tmp.L2TH2Y5coc/artifact_tool_v2-2.8.22/artifact_tool/spreadsheet_warmup.py", line 720, in _warm_feature_flows
  File "/tmp/tmp.L2TH2Y5coc/artifact_tool_v2-2.8.22/artifact_tool/spreadsheet_warmup.py", line 704, in _warm_collaboration_flows
  File "/tmp/tmp.L2TH2Y5coc/artifact_tool_v2-2.8.22/artifact_tool/generated/interface/models.py", line 32317, in hydrate_crdt_from_proto
  File "/tmp/tmp.L2TH2Y5coc/artifact_tool_v2-2.8.22/artifact_tool/rpc/remote.py", line 749, in __call__
  File "/tmp/tmp.L2TH2Y5coc/artifact_tool_v2-2.8.22/artifact_tool/rpc/client.py", line 150, in call
artifact_tool.rpc.client.RemoteError: hydrateCrdtFromProto requires an empty collaborative document.
```

Result: **PASS**

## Covered invariants

- Claude Code ship-guard installer preserves settings and is idempotent
- direct remote push is denied in GSD-controlled project
- GSD ship authorization allows bounded push/PR-create actions
- authorization binds to one Claude session
- PR merge remains denied
- document-release push is restricted to docs allowlist
- runtime source in docs commit range blocks push
- release owner is GSD
- deployment SHA must equal effective release SHA for Canary readiness
- Canary artifact binds to exact deployment/release SHA
- document-release post-mutation validation blocks forbidden source changes

## Target-host checks still required

The artifact runtime does not contain live GSD + Claude Code + gstack runtime wiring.

On a target project:

```bash
node scripts/install-claude-ship-guard.cjs .
gsd capability install ./capabilities/triple-gstack --scope project
gsd loop render-hooks ship:pre --raw
gsd loop render-hooks ship:post --raw
```

Then inspect `/hooks` in Claude Code and run a real GSD ship against a disposable
repository before production adoption.
