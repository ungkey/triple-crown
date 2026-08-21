#!/usr/bin/env bash
set -euo pipefail
umask 077

# Crew convenience installer.
#
# Local checkout / extracted release:
#   bash install.sh --yes
#
# Remote, from the target project:
#   curl -fsSL https://raw.githubusercontent.com/ungkey/triple-crown/v0.6.5/install.sh | bash -s -- --yes
#
# Remote resolution order:
#   1. adjacent package checkout
#   2. CREW_NPM_PACKAGE=<name> (npx <name>@<version>) when set explicitly
#   3. GitHub repository (default: ungkey/triple-crown), pinned with CREW_REF

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" 2>/dev/null && pwd -P || true)"

if [ -n "${SCRIPT_DIR:-}" ] && [ -f "$SCRIPT_DIR/bin/crew.cjs" ]; then
  exec node "$SCRIPT_DIR/bin/crew.cjs" install "$@"
fi

if ! command -v node >/dev/null 2>&1; then
  echo "Crew: Node.js is required." >&2
  exit 1
fi

if ! command -v npx >/dev/null 2>&1; then
  echo "Crew: npx is required for remote installation." >&2
  exit 1
fi

REF="${CREW_REF:-v0.6.5}"

# An explicitly configured npm package wins; otherwise GitHub is the distribution
# channel, so the default path needs no environment variables at all.
if [ -n "${CREW_NPM_PACKAGE:-}" ]; then
  exec npx --yes "${CREW_NPM_PACKAGE}@${CREW_VERSION:-latest}" install "$@"
fi

REPO="${CREW_REPO:-ungkey/triple-crown}"
exec npx --yes "github:${REPO}#${REF}" install "$@"
