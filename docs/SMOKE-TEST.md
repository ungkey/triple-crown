# Smoke Test v0.4

Run:

```bash
python tests/validate_prototype.py
python tests/run_local_smoke.py
```

Covered cases:
- QA issue -> canonical GSD UAT gap
- manual uncovered behavior remains pending
- qa-only mutation blocks
- existing native UAT preserved
- QA rerun is idempotent
- high/open CSO finding blocks ship gate
- resolved high finding passes
- stale security report blocks
- auth-sensitive phase classified high risk

On the target GSD host also run:

```bash
gsd loop render-hooks execute:post --raw
gsd loop render-hooks verify:pre --raw
gsd loop render-hooks ship:pre --raw
```
