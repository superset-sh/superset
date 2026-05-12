#!/usr/bin/env bash
set -uo pipefail

SUPERSET_SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [ "${1:-}" = "--ts" ] || [ "${SUPERSET_SETUP_TS:-}" = "1" ]; then
  if [ "${1:-}" = "--ts" ]; then
    shift
  fi

  if ! command -v bun >/dev/null 2>&1; then
    echo "x bun is required to run the TypeScript setup script" >&2
    echo "  Install from https://bun.sh" >&2
    exit 1
  fi

  exec bun "$SUPERSET_SCRIPT_DIR/../scripts/superset-setup.ts" "$@"
fi

# shellcheck source=/dev/null
source "$SUPERSET_SCRIPT_DIR/lib/common.sh"
# shellcheck source=/dev/null
source "$SUPERSET_SCRIPT_DIR/lib/setup/args.sh"
# shellcheck source=/dev/null
source "$SUPERSET_SCRIPT_DIR/lib/setup/steps.sh"
# shellcheck source=/dev/null
source "$SUPERSET_SCRIPT_DIR/lib/setup/main.sh"

setup_main "$@"
