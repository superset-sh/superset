#!/usr/bin/env bash
set -uo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
NC='\033[0m'

# Step tracking
declare -a FAILED_STEPS=()
declare -a SKIPPED_STEPS=()
REMOVE_DEV_DATA=0

error() { echo -e "${RED}✗${NC} $1"; }
success() { echo -e "${GREEN}✓${NC} $1"; }
warn() { echo -e "${YELLOW}!${NC} $1"; }

print_usage() {
  cat <<EOF
Usage: .superset/teardown.sh [options]

Options:
  -f, --force              Remove superset-dev-data/ in current workspace
  -h, --help               Show this help message
EOF
}

parse_args() {
  while [ $# -gt 0 ]; do
    case "$1" in
      -f|--force)
        REMOVE_DEV_DATA=1
        shift
        ;;
      -h|--help)
        print_usage
        exit 0
        ;;
      *)
        error "Unknown argument: $1"
        print_usage
        return 1
        ;;
    esac
  done

  return 0
}

# Track step failure
step_failed() {
  FAILED_STEPS+=("$1")
}

# Track step skipped
step_skipped() {
  SKIPPED_STEPS+=("$1")
}

# Print summary at the end
print_summary() {
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "📊 Teardown Summary"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

  if [ ${#FAILED_STEPS[@]} -eq 0 ] && [ ${#SKIPPED_STEPS[@]} -eq 0 ]; then
    echo -e "${GREEN}All steps completed successfully!${NC}"
  else
    if [ ${#SKIPPED_STEPS[@]} -gt 0 ]; then
      echo -e "${YELLOW}Skipped steps:${NC}"
      for step in "${SKIPPED_STEPS[@]}"; do
        echo "  - $step"
      done
    fi
    if [ ${#FAILED_STEPS[@]} -gt 0 ]; then
      echo -e "${RED}Failed steps:${NC}"
      for step in "${FAILED_STEPS[@]}"; do
        echo "  - $step"
      done
    fi
  fi
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

  # Return non-zero if any steps failed
  [ ${#FAILED_STEPS[@]} -eq 0 ]
}

step_load_env() {
  echo "📂 Loading environment variables..."

  local sourced_any=false

  # Source root .env first (contains NEON_PROJECT_ID), then local .env for overrides
  if [ -n "${SUPERSET_ROOT_PATH:-}" ] && [ -f "$SUPERSET_ROOT_PATH/.env" ]; then
    set -a
    # shellcheck source=/dev/null
    source "$SUPERSET_ROOT_PATH/.env"
    set +a
    sourced_any=true
  fi

  if [ -f ".env" ]; then
    set -a
    # shellcheck source=/dev/null
    source .env
    set +a
    sourced_any=true
  fi

  if [ "$sourced_any" = false ]; then
    warn "No .env file found (set SUPERSET_ROOT_PATH or run from a workspace with .env); using existing environment"
    step_skipped "env sourcing (no .env files found)"
    return 0
  fi

  success "Environment variables loaded"
  return 0
}

step_check_dependencies() {
  echo "🔍 Checking dependencies..."
  local missing=()

  if ! command -v neonctl &> /dev/null; then
    missing+=("neonctl (Run: npm install -g neonctl)")
  fi

  if ! command -v docker &> /dev/null; then
    missing+=("docker (Install from https://docker.com)")
  fi

  if [ ${#missing[@]} -gt 0 ]; then
    warn "Missing optional dependencies (some steps may be skipped):"
    for dep in "${missing[@]}"; do
      echo "  - $dep"
    done
    return 0
  fi

  success "All dependencies found"
  return 0
}

step_kill_terminal_daemons() {
  echo "🔪 Killing terminal daemon processes..."

  local worktree_path
  worktree_path="$(pwd)"
  local killed=0

  for pattern in "terminal-host.js" "pty-subprocess.js"; do
    local pids
    pids=$(pgrep -f "${worktree_path}/.*${pattern}" 2>/dev/null || true)
    if [ -n "$pids" ]; then
      for pid in $pids; do
        kill "$pid" 2>/dev/null && ((killed++)) || true
      done
    fi
  done

  if [ "$killed" -gt 0 ]; then
    success "Killed $killed terminal daemon process(es)"
  else
    success "No terminal daemon processes found"
  fi

  return 0
}

step_stop_electric() {
  echo "⚡ Stopping Electric SQL container..."

  if ! command -v docker &> /dev/null; then
    warn "Docker not available, skipping"
    step_skipped "electric (docker missing)"
    return 0
  fi

  WORKSPACE_NAME="${SUPERSET_WORKSPACE_NAME:-$(basename "$PWD")}"

  # Sanitize workspace name for Docker (same logic as setup)
  local container_suffix
  container_suffix=$(echo "$WORKSPACE_NAME" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9._-]/-/g' | sed 's/--*/-/g' | sed 's/^-//' | sed 's/-$//')
  local default_container
  default_container=$(echo "superset-electric-$container_suffix" | cut -c1-64)

  ELECTRIC_CONTAINER="${ELECTRIC_CONTAINER:-$default_container}"

  if docker ps -a --format '{{.Names}}' | grep -q "^${ELECTRIC_CONTAINER}$"; then
    docker stop "$ELECTRIC_CONTAINER" &> /dev/null || true
    docker rm "$ELECTRIC_CONTAINER" &> /dev/null || true
    success "Electric container stopped: $ELECTRIC_CONTAINER"
  else
    warn "Electric container '$ELECTRIC_CONTAINER' not found or already removed"
  fi

  return 0
}

step_delete_neon_branch() {
  echo "🗄️  Deleting Neon branch..."

  if ! command -v neonctl &> /dev/null; then
    warn "neonctl not available, skipping"
    step_skipped "neon (neonctl missing)"
    return 0
  fi

  NEON_PROJECT_ID="${NEON_PROJECT_ID:-}"
  if [ -z "$NEON_PROJECT_ID" ]; then
    warn "NEON_PROJECT_ID not set, skipping branch deletion"
    step_skipped "neon (NEON_PROJECT_ID not set)"
    return 0
  fi

  BRANCH_ID="${NEON_BRANCH_ID:-}"
  if [ -z "$BRANCH_ID" ]; then
    warn "No NEON_BRANCH_ID found, skipping branch deletion"
    step_skipped "neon (NEON_BRANCH_ID not set)"
    return 0
  fi

  WORKSPACE_NAME="${SUPERSET_WORKSPACE_NAME:-$(basename "$PWD")}"

  # Check if branch exists before attempting deletion
  if ! neonctl branches get "$BRANCH_ID" --project-id "$NEON_PROJECT_ID" &> /dev/null; then
    warn "Neon branch not found or already deleted: $WORKSPACE_NAME ($BRANCH_ID)"
    return 0
  fi

  local output
  if output=$(neonctl branches delete "$BRANCH_ID" --project-id "$NEON_PROJECT_ID" --force 2>&1); then
    success "Neon branch deleted: $WORKSPACE_NAME ($BRANCH_ID)"
  else
    error "Failed to delete Neon branch: $WORKSPACE_NAME ($BRANCH_ID)"
    error "Output: $output"
    return 1
  fi

  return 0
}

step_remove_dev_data() {
  local dev_data_dir="superset-dev-data"

  if [ "$REMOVE_DEV_DATA" != "1" ]; then
    step_skipped "Remove superset-dev-data (flag not set)"
    return 0
  fi

  echo "🗑️  Removing $dev_data_dir/..."

  if [ ! -d "$dev_data_dir" ]; then
    warn "$dev_data_dir/ not found, skipping"
    step_skipped "Remove superset-dev-data (not found)"
    return 0
  fi

  if ! rm -rf "$dev_data_dir"; then
    error "Failed to remove $dev_data_dir/"
    return 1
  fi

  success "Removed $dev_data_dir/"
  return 0
}

main() {
  if ! parse_args "$@"; then
    return 1
  fi

  echo "🧹 Tearing down Superset workspace..."
  echo ""

  # Step 1: Load environment
  if ! step_load_env; then
    step_failed "Load environment variables"
  fi

  # Step 2: Check dependencies (informational only)
  step_check_dependencies

  # Step 3: Kill terminal daemons
  if ! step_kill_terminal_daemons; then
    step_failed "Kill terminal daemons"
  fi

  # Step 4: Stop Electric SQL
  if ! step_stop_electric; then
    step_failed "Stop Electric SQL"
  fi

  # Step 5: Delete Neon branch
  if ! step_delete_neon_branch; then
    step_failed "Delete Neon branch"
  fi

  # Step 6: Remove superset-dev-data (optional)
  if ! step_remove_dev_data; then
    step_failed "Remove superset-dev-data"
  fi

  # Print summary and exit with appropriate code
  print_summary
}

main "$@"
