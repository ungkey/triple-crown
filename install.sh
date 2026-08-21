#!/usr/bin/env bash
set -euo pipefail
umask 077

# Triple Crown convenience installer.
#
# Local checkout / extracted release:
#   bash install.sh --yes
#
# Remote, from the target project:
#   curl -fsSL https://raw.githubusercontent.com/ungkey/triple-crown/v0.6.5/install.sh | bash -s -- --yes
#
# Remote resolution order:
#   1. adjacent package checkout
#   2. TRIPLE_CROWN_NPM_PACKAGE=<name> (npx <name>@<version>) when set explicitly
#   3. GitHub repository (default: ungkey/triple-crown), pinned with TRIPLE_CROWN_REF

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" 2>/dev/null && pwd -P || true)"

if [ -n "${SCRIPT_DIR:-}" ] && [ -f "$SCRIPT_DIR/bin/triple-crown.cjs" ]; then
  exec node "$SCRIPT_DIR/bin/triple-crown.cjs" install "$@"
fi

if ! command -v node >/dev/null 2>&1; then
  echo "Triple Crown: Node.js is required." >&2
  exit 1
fi

if ! command -v npx >/dev/null 2>&1; then
  echo "Triple Crown: npx is required for remote installation." >&2
  exit 1
fi

REF="${TRIPLE_CROWN_REF:-v0.6.5}"

# An explicitly configured npm package wins; otherwise GitHub is the distribution
# channel, so the default path needs no environment variables at all.
if [ -n "${TRIPLE_CROWN_NPM_PACKAGE:-}" ]; then
  exec npx --yes "${TRIPLE_CROWN_NPM_PACKAGE}@${TRIPLE_CROWN_VERSION:-latest}" install "$@"
fi

REPO="${TRIPLE_CROWN_REPO:-ungkey/triple-crown}"
exec npx --yes "github:${REPO}#${REF}" install "$@"
