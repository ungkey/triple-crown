# Triple Crown v0.6.5 Installer

v0.6.4 adds a single installer entry point so a user no longer has to install
three GSD capabilities and the Claude hook manually.

The installer owns **installation only**. It does not become a workflow
orchestrator.

---

## Immediate use from the downloaded npm tarball

After downloading:

```text
triple-crown-workflow-installer-0.6.5.tgz
```

run from the target project:

### macOS / Linux / Git Bash

```bash
npx --yes --package /path/to/triple-crown-workflow-installer-0.6.5.tgz triple-crown install --yes
```

### Windows PowerShell

```powershell
npx --yes --package C:\path\to\triple-crown-workflow-installer-0.6.5.tgz triple-crown install --yes
```

The default install attempts to bootstrap missing GSD and gstack.

If you already installed dependencies and do not want bootstrap behavior:

```bash
npx --yes --package ./triple-crown-workflow-installer-0.6.5.tgz \
  triple-crown install --yes --no-bootstrap
```

---

# After npm publish

The package skeleton currently uses:

```text
triple-crown-workflow-installer
```

as the candidate npm name.

It has **not been published by this prototype**.

After publishing:

```bash
npx --yes triple-crown-workflow-installer@latest install --yes
```

Interactive terminal:

```bash
npx triple-crown-workflow-installer@latest
```

Without `--yes`, the CLI displays its planned write/install effects and asks for
one confirmation.

---

# Bash install

From a downloaded/extracted release:

```bash
bash install.sh --yes
```

With preinstalled dependencies only:

```bash
bash install.sh --yes --no-bootstrap
```

## Remote install

The canonical repository is <https://github.com/ungkey/triple-crown>. The shortest
remote form needs no bootstrap script at all — run it from the target project:

```bash
npx --yes github:ungkey/triple-crown#v0.6.5 install --yes
```

`install.sh` can also be piped from raw GitHub:

```bash
curl -fsSL https://raw.githubusercontent.com/ungkey/triple-crown/v0.6.5/install.sh | bash -s -- --yes
```

`ungkey/triple-crown` is the built-in default; `TRIPLE_CROWN_REPO` only needs to
be set to install from a fork. `TRIPLE_CROWN_REF` pins a tag or branch:

```bash
curl -fsSL https://raw.githubusercontent.com/ungkey/triple-crown/v0.6.5/install.sh \
  | TRIPLE_CROWN_REF=v0.6.5 bash -s -- --yes
```

Windows PowerShell uses the same environment variables:

```powershell
irm https://raw.githubusercontent.com/ungkey/triple-crown/v0.6.5/install.ps1 -OutFile install.ps1
.\install.ps1 --yes
```

`TRIPLE_CROWN_NPM_PACKAGE` overrides both forms with an npm registry package.

---

# What install actually does

The installer:

```text
1. checks Node / Git
2. detects or bootstraps GSD
3. detects or bootstraps gstack
4. checks Superpowers availability
5. vendors a stable source copy into .triple-crown/
6. refreshes three project GSD capabilities
7. verifies each capability is active
8. installs/updates the Triple Crown skills in <project>/.claude/skills/
9. installs/updates managed CLAUDE.md routing
10. installs/updates the Claude PreToolUse ship guard
```

Step 8 is what makes the commands visible to Claude Code. GSD materializes a
third-party capability skill only from the GLOBAL overlay
(`$HOME/.gsd/capabilities`) and only when its surface-apply path runs, so a
project-scoped `capability install` never reaches a skills root on its own.
Triple Crown keeps the capabilities project-scoped — global ones would activate
their gates in every repository on the machine — and copies the skills itself:

```text
<project>/.claude/skills/gsd-triple-crown/
<project>/.claude/skills/gsd-triple-gstack-code-review/
<project>/.claude/skills/gsd-triple-gstack-qa-only/
<project>/.claude/skills/gsd-triple-gstack-cso/
<project>/.claude/skills/gsd-triple-gstack-post-ship/
<project>/.claude/skills/gsd-triple-gstack-release-observe/
```

Each directory carries a `.triple-crown-skill` ownership marker. Install refuses
to overwrite an unmarked directory, and uninstall removes only marked ones.

Installed GSD capabilities:

```text
triple-superpowers
triple-gstack
triple-crown-guide
```

The stable source copy is deliberate:

```text
project/
└── .triple-crown/
    ├── VERSION
    ├── INSTALL-MANIFEST.json
    ├── capabilities/
    ├── CLAUDE-routing-fragment.md
    └── WORKFLOW-QUICK-REFERENCE.md
```

GSD is registered against:

```text
./.triple-crown/capabilities/<id>
```

rather than an npm/npx temporary cache path.

This means a later npm cache cleanup does not invalidate the capability source
record.

---

# Dependency bootstrap

## GSD

If GSD is missing, the installer uses the current official npm installer form:

```bash
npx --yes @opengsd/gsd-core@latest --claude --global
```

Current GSD 1.10 requires:

```text
Node >= 24
npm >= 10
```

The Triple Crown installer itself can start on older Node versions so it can
produce a useful diagnostic, but real Triple Crown/GSD installation fails closed
below Node 24.

## gstack

If gstack is missing, the installer:

```text
git clone --single-branch --depth 1
https://github.com/garrytan/gstack.git
~/.claude/skills/gstack
```

then runs:

```bash
./setup --host claude --no-prefix
```

Triple Crown intentionally selects short skill ids:

```text
/review
/qa-only
/cso
/canary
/document-release
/retro
```

because those are the default ids stored in the Triple Crown capability config.

gstack setup requires Bun.

## Superpowers

Superpowers' official Claude Code installation is a Claude plugin command:

```text
/plugin install superpowers@claude-plugins-official
```

The shell/npx installer does **not** fake this step.

If Superpowers is missing:
- normal install completes with a warning;
- `--strict` fails installation and asks you to install the plugin first.

This avoids pretending a shell installer can authoritatively complete a
Claude-marketplace action.

---

# Commands

## Install

```bash
npx triple-crown-workflow-installer install
```

Options:

```text
--project PATH
--yes / -y
--bootstrap
--no-bootstrap
--no-routing
--no-ship-guard
--strict
--dry-run
--verbose
```

## Doctor

```bash
npx triple-crown-workflow-installer doctor
```

Checks:

```text
Node
Git
GSD capability CLI
gstack source
gstack short skill IDs
Superpowers
.triple-crown stable source
three GSD capability activation states
Triple Crown skills present in <project>/.claude/skills
no shadowing copies in ~/.claude/skills
CLAUDE.md routing
ship guard installed
ship guard executable
ship guard registered with an explicit node interpreter
```

`skills-installed` is the check that fails when Claude Code cannot see the
commands. `skills-no-global-shadow` warns when a leftover
`~/.claude/skills/gsd-triple-*` copy could take precedence over the project's.

JSON:

```bash
npx triple-crown-workflow-installer doctor --json
```

## Workflow status

```bash
npx triple-crown-workflow-installer status
```

This invokes the installed Triple Crown guide.

Inside Claude Code the shorter UX remains:

```text
/gsd-triple-crown
```

## Uninstall

```bash
npx triple-crown-workflow-installer uninstall --yes
```

It removes:
- Triple Crown capability registrations;
- `.triple-crown/`;
- only the skill directories under `<project>/.claude/skills/` that carry the
  `.triple-crown-skill` marker — a hand-authored `gsd-*` skill is preserved;
- only the managed Triple Crown routing block from `CLAUDE.md`;
- only the Triple Crown ship-guard hook/registration.

It does **not** uninstall GSD, gstack, or Superpowers.

---

# Publish to npm

Before publishing, choose your npm package and GitHub repository.

Example:

```bash
node scripts/configure-distribution.cjs \
  --repo YOUR_ORG/triple-crown-workflow \
  --package @YOUR_SCOPE/triple-crown
```

Then:

```bash
npm pack
npm publish --access public
```

For an unscoped package:

```bash
node scripts/configure-distribution.cjs \
  --repo YOUR_ORG/triple-crown-workflow \
  --package triple-crown-workflow-installer
```

The generated npm tarball can be tested before publish:

```bash
npx --yes --package ./triple-crown-workflow-installer-0.6.5.tgz triple-crown install --yes
```

---

# Recommended public installation UX

Once repository/package publishing is complete, README should expose only these
two primary paths:

```bash
npx --yes <published-package>@latest install --yes
```

or:

```bash
curl -fsSL <raw-install.sh-url> | bash -s -- --yes
```

All manual `gsd capability install ...` commands become troubleshooting/internal
documentation rather than the normal user installation path.
