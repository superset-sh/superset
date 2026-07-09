#!/usr/bin/env bash

# The single entry point for releases (`bun run release`).
#
# Routes to the desktop or CLI flow so the whole bundle (desktop + host-service
# + cli) can't drift — both flows and the CI guard share scripts/lib/release-lib.sh.
# See plans/20260709-unified-version-bumping.md.
#
# Usage:
#   bun run release                       # interactive menu
#   bun run release desktop [version] [--publish] [--merge]
#   bun run release cli [suffix] [--daemon] [--no-tag]
#   bun run release check                 # verify versions are unified

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(git -C "${SCRIPT_DIR}" rev-parse --show-toplevel)"

DESKTOP_FLOW="${REPO_ROOT}/apps/desktop/create-release.sh"
CLI_FLOW="${REPO_ROOT}/scripts/bump-cli.sh"
CHECK="${REPO_ROOT}/scripts/check-versions.sh"

usage() {
  cat <<'EOF'
Usage: bun run release [command] [flags]

Commands:
  desktop [version] [--publish] [--merge]   New version; desktop + host-service +
                                            cli move together, publishes desktop.
  cli [suffix] [--daemon] [--no-tag]        Interim prerelease (<desktop>-N) for
                                            cli + host-service (+ pty-daemon with
                                            --daemon).
  check                                     Verify versions are unified.

Run with no command for an interactive menu.
EOF
}

sub="${1:-}"
case "$sub" in
  desktop)
    shift
    exec "${DESKTOP_FLOW}" "$@"
    ;;
  cli)
    shift
    exec "${CLI_FLOW}" "$@"
    ;;
  check)
    shift
    exec "${CHECK}" "$@"
    ;;
  -h | --help | help)
    usage
    ;;
  "")
    echo "What do you want to release?"
    echo "  1) Desktop     — new version; desktop + host-service + cli move together, publishes desktop"
    echo "  2) CLI hotfix  — interim prerelease (<desktop>-N) for cli + host-service"
    echo ""
    read -p "Enter choice [1-2]: " choice
    echo ""
    case "$choice" in
      1) exec "${DESKTOP_FLOW}" ;;
      2) exec "${CLI_FLOW}" ;;
      *)
        echo "Invalid choice." >&2
        exit 1
        ;;
    esac
    ;;
  *)
    echo "Unknown command: ${sub}" >&2
    echo "" >&2
    usage >&2
    exit 1
    ;;
esac
