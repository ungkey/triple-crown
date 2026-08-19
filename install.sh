#!/usr/bin/env bash
set -euo pipefail
umask 077

# Triple Crown convenience installer.
#
# Local checkout / extracted release:
#   bash install.sh --yes
#
# Once this project is published on npm:
#   curl -fsSL <RAW_INSTALL_SH_URL> | bash -s -- --yes
#
# Remote resolution order:
#   1. adjacent package checkout
#   2. TRIPLE_CROWN_REPO=owner/repo (npx github:owner/repo#ref)
#   3. npm package (default: triple-crown-workflow-installer)

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

REF="${TRIPLE_CROWN_REF:-main}"

if [ -n "${TRIPLE_CROWN_REPO:-}" ]; then
  exec npx --yes "github:${TRIPLE_CROWN_REPO}#${REF}" install "$@"
fi

PACKAGE="${TRIPLE_CROWN_NPM_PACKAGE:-triple-crown-workflow-installer}"
VERSION="${TRIPLE_CROWN_VERSION:-latest}"
exec npx --yes "${PACKAGE}@${VERSION}" install "$@"
