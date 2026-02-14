# Teardown steps.

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

  if ! command -v jq &> /dev/null; then
    missing+=("jq (Run: brew install jq)")
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

step_deallocate_port() {
  echo "🔌 Deallocating port base..."

  local alloc_file="$HOME/.superset/port-allocations.json"
  local lock_dir="$HOME/.superset/port-allocations.lock"

  if [ ! -f "$alloc_file" ]; then
    warn "No port allocations file found, skipping"
    step_skipped "Deallocate port (no allocations file)"
    return 0
  fi

  if ! acquire_port_alloc_lock "$lock_dir" 30 300; then
    return 1
  fi

  local key="$PWD"
  local existing
  if ! existing=$(jq -r --arg k "$key" '.[$k] // empty' "$alloc_file" 2>/dev/null); then
    error "Failed to read port allocations: $alloc_file"
    release_port_alloc_lock "$lock_dir"
    return 1
  fi

  if [ -z "$existing" ]; then
    warn "No port allocation found for $key"
    step_skipped "Deallocate port (no allocation for this workspace)"
    release_port_alloc_lock "$lock_dir"
    return 0
  fi

  local tmp_file="${alloc_file}.tmp.$$"
  if ! jq --arg k "$key" 'del(.[$k])' "$alloc_file" > "$tmp_file"; then
    error "Failed to write updated port allocations"
    rm -f "$tmp_file"
    release_port_alloc_lock "$lock_dir"
    return 1
  fi
  if ! mv "$tmp_file" "$alloc_file"; then
    error "Failed to persist port allocations"
    rm -f "$tmp_file"
    release_port_alloc_lock "$lock_dir"
    return 1
  fi

  success "Deallocated port base $existing for $key"
  release_port_alloc_lock "$lock_dir"
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
