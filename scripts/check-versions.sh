#!/usr/bin/env bash

# Enforces unified versioning across the desktop app and the CLI bundle.
#
# Rule (defined in scripts/lib/release-lib.sh): desktop is the ceiling and is
# always a plain MAJOR.MINOR.PATCH release; every UNIFIED_PACKAGES entry must
# share that base and equal each other. Interim CLI releases add a prerelease
# suffix (e.g. 1.14.0-1) which sorts BELOW the desktop release, so the CLI never
# ships a version above desktop. pty-daemon is excluded (its own 0.x track).

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=scripts/lib/release-lib.sh
source "${ROOT}/scripts/lib/release-lib.sh"

if ! assert_unified "${ROOT}"; then
  echo ""
  echo "Version drift detected. Unified rule: desktop == ${UNIFIED_PACKAGES[*]}"
  echo "(interim CLI releases may add a -N suffix, e.g. $(pkg_version "${ROOT}/${DESKTOP_PACKAGE}")-1)."
  exit 1
fi

DESKTOP="$(pkg_version "${ROOT}/${DESKTOP_PACKAGE}")"
echo "✓ versions unified at ${DESKTOP}: ${DESKTOP_PACKAGE} $(for p in "${UNIFIED_PACKAGES[@]}"; do printf '%s=%s ' "$p" "$(pkg_version "${ROOT}/${p}")"; done)"
