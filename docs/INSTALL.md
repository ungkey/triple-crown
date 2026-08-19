# Installation note — v0.6.4

The preferred path is now the one-command installer. See `docs/INSTALLER.md`.

```bash
npx --yes triple-crown-workflow-installer@latest install --yes
```

The manual capability commands below are retained for troubleshooting, offline
development, and installer debugging.

---

# Install / Target Validation v0.6.1

v0.6 installation has two parts:

```text
1. Triple Crown runtime capabilities / ship guard
2. E2E compatibility validation
```

## Prerequisites

For the current GSD 1.10 baseline, use:

```text
Node >= 24.0.0
npm  >= 10.0.0
Git
Claude Code
GSD 1.10.x
gstack
Superpowers
```

For real PR/ship acceptance:

```text
gh
GitHub authentication
disposable remote repository
```

gstack setup also requires Bun.

## Upstream installation references

### GSD for Claude Code

Current standard installer:

```bash
npx @opengsd/gsd-core@latest --claude --global
```

Use `--local` instead of `--global` if you intentionally want project-only GSD
runtime files.

Restart Claude Code after installation.

### gstack

Current Claude Code setup:

```bash
git clone --single-branch --depth 1 https://github.com/garrytan/gstack.git ~/.claude/skills/gstack
cd ~/.claude/skills/gstack
./setup
```

### Superpowers

In Claude Code, current official marketplace install:

```text
/plugin install superpowers@claude-plugins-official
```

## Install Triple Crown project capabilities

From the v0.6.1 bundle or your copied project integration directory:

```bash
gsd capability install ./capabilities/triple-superpowers --scope project --yes
gsd capability install ./capabilities/triple-gstack --scope project --yes
gsd capability install ./capabilities/triple-crown-guide --scope project --yes
```

`--yes` is explicit third-party capability consent. Review the bundle before
granting it. The v0.6 E2E runner uses `--yes` only inside its disposable fixture.


## Verify Workflow Guide

The installer copies the six Triple Crown skills into
`<project>/.claude/skills/gsd-triple-*/`. A GSD `capability install` alone never
reaches a skills root, so this step is what makes the commands visible.

Start a new Claude Code session in the project (or reload the window), then
invoke:

```text
/gsd-triple-crown
```

If the command is still unknown, run `triple-crown doctor` and check
`skills-installed`. A `FAIL` there names the missing directories; a
`skills-no-global-shadow` warning means an older global copy in
`~/.claude/skills/` may be taking precedence and should be removed.

Useful orientation commands:

```text
/gsd-triple-crown next
/gsd-triple-crown resume
/gsd-triple-crown help recovery
/gsd-triple-crown doctor
```

The guide is read-only. It never advances the workflow automatically.

## Install hard ship guard

```bash
node scripts/install-claude-ship-guard.cjs .
```

Inspect Claude Code:

```text
/hooks
```

## Run environment doctor

```bash
node e2e/doctor.cjs
```

If tools are installed outside standard paths:

```bash
TRIPLE_GSD_BIN=/path/to/gsd \
TRIPLE_GSTACK_HOME=/path/to/gstack \
TRIPLE_SUPERPOWERS_HOME=/path/to/superpowers/skills \
node e2e/doctor.cjs
```

PowerShell equivalent:

```powershell
$env:TRIPLE_GSD_BIN = "C:\path\to\gsd.exe"
$env:TRIPLE_GSTACK_HOME = "C:\Users\me\.claude\skills\gstack"
$env:TRIPLE_SUPERPOWERS_HOME = "C:\path\to\superpowers\skills"
node .\e2e\doctor.cjs
```

## Run L0

```bash
python tests/run_v06_l0.py
```

## Run real L1

macOS/Linux:

```bash
./e2e/run-target.sh
```

Windows PowerShell:

```powershell
.\e2e\run-target.ps1
```

Or directly:

```bash
node e2e/run-live.cjs --keep
```

## Run L2

Continue with:

```text
e2e/ACCEPTANCE-RUNBOOK.md
```

Use only a disposable project/remote for the real ship portion.

## Acceptance status rule

Do not label the integration fully compatible until:

```text
L0 PASS
L1 real GSD PASS
L2 real Claude/gstack/Superpowers PASS
```
