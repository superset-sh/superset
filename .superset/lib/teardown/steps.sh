# Teardown steps.

step_load_env() {
  echo "📂 Loading environment variables..."

  local sourced_any=false
  WORKSPACE_ENV_LOADED=false

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
    WORKSPACE_ENV_LOADED=true
  fi

  if [ "$sourced_any" = false ]; then
    warn "No .env file found (set SUPERSET_ROOT_PATH or run from a workspace with .env); using existing environment"
    step_skipped "env sourcing (no .env files found)"
    return 0
  fi

  success "Environment variables loaded"
  if [ "$WORKSPACE_ENV_LOADED" = false ]; then
    warn "Workspace .env not found in current directory; teardown will skip workspace-specific DB cleanup/deletion steps"
  fi
  return 0
}

step_check_dependencies() {
  echo "🔍 Checking dependencies..."
  local missing=()

  if ! command -v neonctl &> /dev/null; then
    missing+=("neonctl (Run: npm install -g neonctl)")
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

  kill_process_tree() {
    local pid="$1"
    local signal="${2:-TERM}"
    local children=""
    local child=""

    children=$(pgrep -P "$pid" 2>/dev/null || true)
    for child in $children; do
      kill_process_tree "$child" "$signal"
    done

    kill -s "$signal" "$pid" 2>/dev/null || true
  }

  local worktree_path
  worktree_path="$(pwd)"
  local matched_pids=""
  local root_killed=0
  local force_killed=0

  matched_pids=$(
    {
      pgrep -f "${worktree_path}/.*terminal-host\\.js" 2>/dev/null || true
      pgrep -f "${worktree_path}/.*pty-subprocess\\.js" 2>/dev/null || true
    } | sort -u
  )

  for pid in $matched_pids; do
    if kill -0 "$pid" 2>/dev/null; then
      kill_process_tree "$pid" TERM
      root_killed=$((root_killed + 1))
    fi
  done

  # Escalate to SIGKILL for any survivors after graceful termination.
  for pid in $matched_pids; do
    if kill -0 "$pid" 2>/dev/null; then
      kill_process_tree "$pid" KILL
      force_killed=$((force_killed + 1))
    fi
  done

  if [ "$root_killed" -gt 0 ] && [ "$force_killed" -gt 0 ]; then
    success "Killed process trees for $root_killed terminal daemon root process(es), force-killed $force_killed stuck root process(es)"
  elif [ "$root_killed" -gt 0 ]; then
    success "Killed process trees for $root_killed terminal daemon root process(es)"
  else
    success "No terminal daemon processes found"
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

  if [ "${WORKSPACE_ENV_LOADED:-false}" != "true" ] || [ ! -f ".env" ]; then
    warn "Workspace .env not loaded, skipping branch deletion"
    step_skipped "neon (workspace .env missing)"
    return 0
  fi

  BRANCH_ID=$(
    (
      set -a
      # shellcheck source=/dev/null
      source .env
      printf '%s' "${NEON_BRANCH_ID:-}"
    ) 2>/dev/null
  )
  if [ -z "$BRANCH_ID" ]; then
    warn "No NEON_BRANCH_ID found in workspace .env, skipping branch deletion"
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
