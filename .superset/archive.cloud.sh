#!/usr/bin/env bash
# Cloud [archive]: deletes this workspace's Neon branch before the box stops.
# Only that: the box's terminals must keep working if the archive is undone,
# and setup.cloud.sh creates the branch again on the next boot.
set -uo pipefail

SUPERSET_SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# shellcheck source=/dev/null
source "$SUPERSET_SCRIPT_DIR/lib/common.sh"
# shellcheck source=/dev/null
source "$SUPERSET_SCRIPT_DIR/lib/teardown/steps.sh"

FAILED_STEPS=()
SKIPPED_STEPS=()

step_load_env || step_failed "Load environment variables"
step_delete_neon_branch || step_failed "Delete Neon branch"

print_summary "Cloud archive"
