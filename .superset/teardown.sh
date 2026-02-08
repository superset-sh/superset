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

error() { echo -e "${RED}✗${NC} $1"; }
success() { echo -e "${GREEN}✓${NC} $1"; }
warn() { echo -e "${YELLOW}!${NC} $1"; }

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

  if [ ! -f ".env" ]; then
    warn "No .env file found in current directory; using existing environment"
    return 0
  fi

  set -a
  # shellcheck source=/dev/null
  source .env
  set +a

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
    error "Missing dependencies:"
    for dep in "${missing[@]}"; do
      echo "  - $dep"
    done
    return 1
  fi

  success "All dependencies found"
  return 0
}

step_stop_electric() {
  echo "⚡ Stopping Electric SQL container..."

  if ! command -v docker &> /dev/null; then
    error "Docker not available"
    return 1
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

  NEON_PROJECT_ID="${NEON_PROJECT_ID:-}"
  if [ -z "$NEON_PROJECT_ID" ]; then
    error "NEON_PROJECT_ID environment variable is required"
    return 1
  fi

  BRANCH_ID="${NEON_BRANCH_ID:-}"
  if [ -z "$BRANCH_ID" ]; then
    warn "No NEON_BRANCH_ID found in .env; skipping branch deletion"
    return 0
  fi

  if ! command -v neonctl &> /dev/null; then
    error "neonctl not available"
    return 1
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

main() {
  echo "🧹 Tearing down Superset workspace..."
  echo ""

  # Step 1: Load environment
  if ! step_load_env; then
    step_failed "Load environment variables"
  fi

  # Step 2: Check dependencies
  if ! step_check_dependencies; then
    step_failed "Check dependencies"
  fi

  # Step 3: Stop Electric SQL
  if ! step_stop_electric; then
    step_failed "Stop Electric SQL"
  fi

  # Step 4: Delete Neon branch
  if ! step_delete_neon_branch; then
    step_failed "Delete Neon branch"
  fi

  # Print summary and exit with appropriate code
  print_summary
}

main "$@"
