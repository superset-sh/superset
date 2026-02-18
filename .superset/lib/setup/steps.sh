# Setup steps.

step_load_env() {
  echo "📂 Loading environment variables..."

  if [ -z "${SUPERSET_ROOT_PATH:-}" ]; then
    error "SUPERSET_ROOT_PATH not set"
    return 1
  fi

  if [ ! -f "$SUPERSET_ROOT_PATH/.env" ]; then
    error "Root .env file not found at $SUPERSET_ROOT_PATH/.env"
    return 1
  fi

  set -a
  # shellcheck source=/dev/null
  source "$SUPERSET_ROOT_PATH/.env"
  set +a

  success "Environment variables loaded"
  return 0
}

step_check_dependencies() {
  echo "🔍 Checking dependencies..."
  local missing=()

  if ! command -v bun &> /dev/null; then
    missing+=("bun (Install from https://bun.sh)")
  fi

  if ! command -v neonctl &> /dev/null; then
    missing+=("neonctl (Run: npm install -g neonctl)")
  fi

  if ! command -v jq &> /dev/null; then
    missing+=("jq (Run: brew install jq)")
  fi

  if ! command -v docker &> /dev/null; then
    missing+=("docker (Install from https://docker.com)")
  fi

  if ! command -v caddy &> /dev/null; then
    warn "caddy not found — HTTP/2 proxy for Electric won't work (Run: brew install caddy && caddy trust)"
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

step_install_dependencies() {
  echo "📥 Installing dependencies..."

  if ! command -v bun &> /dev/null; then
    error "Bun not available, skipping dependency installation"
    return 1
  fi

  if ! bun install; then
    error "Failed to install dependencies"
    return 1
  fi

  success "Dependencies installed"
  return 0
}

step_setup_neon_branch() {
  echo "🗄️  Setting up Neon branch..."

  NEON_PROJECT_ID="${NEON_PROJECT_ID:-}"
  if [ -z "$NEON_PROJECT_ID" ]; then
    error "NEON_PROJECT_ID environment variable is required"
    return 1
  fi

  if ! command -v neonctl &> /dev/null; then
    error "neonctl not available"
    return 1
  fi

  if ! command -v jq &> /dev/null; then
    error "jq not available"
    return 1
  fi

  WORKSPACE_NAME="${SUPERSET_WORKSPACE_NAME:-$(basename "$PWD")}"

  # Check if branch already exists
  local branches_output
  # NO 2>&1 - keep stdout (JSON) and stderr (errors) separate
  if ! branches_output=$(neonctl branches list --project-id "$NEON_PROJECT_ID" --output json); then
    error "Failed to list Neon branches (check output above)"
    return 1
  fi

  # Validate JSON before parsing
  if ! validate_json "$branches_output" "Neon branches list"; then
    return 1
  fi

  # Now safe to parse with jq - use // empty for fallback
  EXISTING_BRANCH=$(echo "$branches_output" | jq -r ".[] | select(.name == \"$WORKSPACE_NAME\") | .id // empty" 2>/dev/null)

  if [ -n "$EXISTING_BRANCH" ]; then
    echo "  Using existing Neon branch..."
    BRANCH_ID="$EXISTING_BRANCH"
  else
    echo "  Creating new Neon branch..."
    local neon_output
    # NO 2>&1 - keep stdout (JSON) and stderr (errors) separate
    if ! neon_output=$(neonctl branches create \
        --project-id "$NEON_PROJECT_ID" \
        --name "$WORKSPACE_NAME" \
        --output json); then
      error "Failed to create Neon branch (check output above)"
      return 1
    fi

    # Validate JSON before parsing
    if ! validate_json "$neon_output" "Neon branch creation"; then
      return 1
    fi

    # Parse with fallback - if .branch.id doesn't exist, try .id
    BRANCH_ID=$(echo "$neon_output" | jq -r '.branch.id // .id // empty' 2>/dev/null)

    # Verify we got a branch ID
    if [ -z "$BRANCH_ID" ]; then
      error "Branch ID not found in neonctl response"
      echo "Response structure:" >&2
      echo "$neon_output" | jq '.' >&2 2>/dev/null || echo "$neon_output" >&2
      return 1
    fi
  fi

  # Get connection strings
  if ! DIRECT_URL=$(neonctl connection-string "$BRANCH_ID" --project-id "$NEON_PROJECT_ID" --role-name neondb_owner); then
    error "Failed to get direct connection string (check output above)"
    return 1
  fi

  if ! POOLED_URL=$(neonctl connection-string "$BRANCH_ID" --project-id "$NEON_PROJECT_ID" --role-name neondb_owner --pooled); then
    error "Failed to get pooled connection string (check output above)"
    return 1
  fi

  # Export for use in other steps
  export BRANCH_ID DIRECT_URL POOLED_URL WORKSPACE_NAME

  success "Neon branch ready: $WORKSPACE_NAME"
  return 0
}

step_start_electric() {
  echo "⚡ Starting Electric SQL container..."

  if ! command -v docker &> /dev/null; then
    error "Docker not available"
    return 1
  fi

  if [ -z "${DIRECT_URL:-}" ]; then
    error "Database URL not available (Neon branch setup may have failed)"
    return 1
  fi

  WORKSPACE_NAME="${WORKSPACE_NAME:-$(basename "$PWD")}"

  # Sanitize workspace name for Docker (valid chars only, max 64 chars)
  local container_suffix
  container_suffix=$(echo "$WORKSPACE_NAME" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9._-]/-/g' | sed 's/--*/-/g' | sed 's/^-//' | sed 's/-$//')
  ELECTRIC_CONTAINER=$(echo "superset-electric-$container_suffix" | cut -c1-64)
  ELECTRIC_SECRET="${ELECTRIC_SECRET:-local_electric_dev_secret}"

  # Stop and remove existing container if it exists
  if docker ps -a --format '{{.Names}}' | grep -q "^${ELECTRIC_CONTAINER}$"; then
    echo "  Stopping existing container..."
    docker stop "$ELECTRIC_CONTAINER" &> /dev/null || true
    docker rm "$ELECTRIC_CONTAINER" &> /dev/null || true
  fi

  # Step 6 allocates SUPERSET_PORT_BASE; Electric must use that reserved port.
  if [ -z "${SUPERSET_PORT_BASE:-}" ]; then
    error "SUPERSET_PORT_BASE not set before starting Electric"
    return 1
  fi

  local port_flag
  ELECTRIC_PORT=$((SUPERSET_PORT_BASE + 9))
  port_flag="-p $ELECTRIC_PORT:3000"

  if ! docker run -d \
      --name "$ELECTRIC_CONTAINER" \
      $port_flag \
      -e DATABASE_URL="$DIRECT_URL" \
      -e ELECTRIC_SECRET="$ELECTRIC_SECRET" \
      electricsql/electric:latest &> /dev/null; then
    error "Failed to start Electric container"
    return 1
  fi

  # Wait for Electric to be ready
  echo "  Waiting for Electric to be ready on port $ELECTRIC_PORT..."
  local ready=false
  for i in {1..30}; do
    if curl -s "http://localhost:$ELECTRIC_PORT/v1/health" &> /dev/null; then
      ready=true
      break
    fi
    sleep 1
  done

  if [ "$ready" = false ]; then
    error "Electric failed to start within 30s. Check logs: docker logs $ELECTRIC_CONTAINER"
    return 1
  fi

  ELECTRIC_URL="http://localhost:$ELECTRIC_PORT/v1/shape"

  # Export for use in other steps
  export ELECTRIC_CONTAINER ELECTRIC_PORT ELECTRIC_URL ELECTRIC_SECRET

  success "Electric SQL running at $ELECTRIC_URL"
  return 0
}

allocate_port_base() {
  local alloc_file="$HOME/.superset/port-allocations.json"
  local lock_dir="$HOME/.superset/port-allocations.lock"
  local start=3000
  local range=20

  # Ensure directory and file exist
  mkdir -p "$HOME/.superset"
  if [ ! -f "$alloc_file" ]; then
    echo '{}' > "$alloc_file"
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

  if [ -n "$existing" ]; then
    export SUPERSET_PORT_BASE="$existing"
    release_port_alloc_lock "$lock_dir"
    return 0
  fi

  # Collect used port bases
  local used
  if ! used=$(jq -r '[.[]] | sort | .[]' "$alloc_file" 2>/dev/null); then
    error "Failed to parse used port allocations: $alloc_file"
    release_port_alloc_lock "$lock_dir"
    return 1
  fi

  # Find first available slot
  local candidate=$start
  while echo "$used" | grep -qx "$candidate" 2>/dev/null; do
    candidate=$((candidate + range))
  done

  # Write allocation
  local tmp_file="${alloc_file}.tmp.$$"
  if ! jq --arg k "$key" --argjson v "$candidate" '. + {($k): $v}' "$alloc_file" > "$tmp_file"; then
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

  export SUPERSET_PORT_BASE="$candidate"
  release_port_alloc_lock "$lock_dir"
  return 0
}

step_write_env() {
  echo "📝 Writing .env file..."

  if [ -z "${SUPERSET_ROOT_PATH:-}" ] || [ ! -f "$SUPERSET_ROOT_PATH/.env" ]; then
    error "Root .env file not available"
    return 1
  fi

  # Copy root .env
  if ! cp "$SUPERSET_ROOT_PATH/.env" .env; then
    error "Failed to copy root .env"
    return 1
  fi

  # Append workspace-specific values
  {
    echo ""
    echo "# Workspace Identity"
    write_env_var "SUPERSET_WORKSPACE_NAME" "${WORKSPACE_NAME:-$(basename "$PWD")}"
    write_env_var "SUPERSET_HOME_DIR" "$PWD/superset-dev-data"
    echo ""
    echo "# Workspace Database (Neon Branch)"
    if [ -n "${BRANCH_ID:-}" ]; then
      write_env_var "NEON_BRANCH_ID" "$BRANCH_ID"
    fi
    if [ -n "${POOLED_URL:-}" ]; then
      write_env_var "DATABASE_URL" "$POOLED_URL"
    fi
    if [ -n "${DIRECT_URL:-}" ]; then
      write_env_var "DATABASE_URL_UNPOOLED" "$DIRECT_URL"
    fi

    echo ""
    echo "# Workspace Electric SQL (Docker)"
    if [ -n "${ELECTRIC_CONTAINER:-}" ]; then
      write_env_var "ELECTRIC_CONTAINER" "$ELECTRIC_CONTAINER"
    fi
    if [ -n "${ELECTRIC_PORT:-}" ]; then
      write_env_var "ELECTRIC_PORT" "$ELECTRIC_PORT"
    fi
    if [ -n "${ELECTRIC_URL:-}" ]; then
      write_env_var "ELECTRIC_URL" "$ELECTRIC_URL"
    fi
    if [ -n "${ELECTRIC_SECRET:-}" ]; then
      write_env_var "ELECTRIC_SECRET" "$ELECTRIC_SECRET"
    fi

    # Port allocation for multi-worktree dev instances
    # Each workspace gets a range of 20 ports from its base.
    # Offsets: +0 web, +1 api, +2 marketing, +3 admin, +4 docs,
    #          +5 desktop vite, +6 notifications, +7 streams, +8 streams internal, +9 electric,
    #          +10 caddy (HTTP/2 reverse proxy for API electric endpoint), +11 code inspector,
    #          +12 desktop automation (CDP)
    local BASE=$SUPERSET_PORT_BASE

    # App ports (fixed offsets from base)
    local WEB_PORT=$((BASE))
    local API_PORT=$((BASE + 1))
    local MARKETING_PORT=$((BASE + 2))
    local ADMIN_PORT=$((BASE + 3))
    local DOCS_PORT=$((BASE + 4))
    local DESKTOP_VITE_PORT=$((BASE + 5))
    local DESKTOP_NOTIFICATIONS_PORT=$((BASE + 6))
    local ELECTRIC_PORT=$((BASE + 9))
    local CADDY_ELECTRIC_PORT=$((BASE + 10))
    local CODE_INSPECTOR_PORT=$((BASE + 11))
    local DESKTOP_AUTOMATION_PORT=$((BASE + 12))

    echo ""
    echo "# Workspace Ports (allocated from SUPERSET_PORT_BASE=$BASE, range=20)"
    write_env_var "SUPERSET_PORT_BASE" "$BASE"
    write_env_var "WEB_PORT" "$WEB_PORT"
    write_env_var "API_PORT" "$API_PORT"
    write_env_var "MARKETING_PORT" "$MARKETING_PORT"
    write_env_var "ADMIN_PORT" "$ADMIN_PORT"
    write_env_var "DOCS_PORT" "$DOCS_PORT"
    write_env_var "DESKTOP_VITE_PORT" "$DESKTOP_VITE_PORT"
    write_env_var "DESKTOP_NOTIFICATIONS_PORT" "$DESKTOP_NOTIFICATIONS_PORT"
    write_env_var "ELECTRIC_PORT" "$ELECTRIC_PORT"
    write_env_var "CADDY_ELECTRIC_PORT" "$CADDY_ELECTRIC_PORT"
    write_env_var "CODE_INSPECTOR_PORT" "$CODE_INSPECTOR_PORT"
    write_env_var "DESKTOP_AUTOMATION_PORT" "$DESKTOP_AUTOMATION_PORT"
    echo ""
    echo "# Cross-app URLs (overrides from root .env)"
    write_env_var "NEXT_PUBLIC_API_URL" "http://localhost:$API_PORT"
    write_env_var "NEXT_PUBLIC_WEB_URL" "http://localhost:$WEB_PORT"
    write_env_var "NEXT_PUBLIC_MARKETING_URL" "http://localhost:$MARKETING_PORT"
    write_env_var "NEXT_PUBLIC_ADMIN_URL" "http://localhost:$ADMIN_PORT"
    write_env_var "NEXT_PUBLIC_DOCS_URL" "http://localhost:$DOCS_PORT"
    write_env_var "NEXT_PUBLIC_DESKTOP_URL" "http://localhost:$DESKTOP_VITE_PORT"
    write_env_var "EXPO_PUBLIC_WEB_URL" "http://localhost:$WEB_PORT"
    write_env_var "EXPO_PUBLIC_API_URL" "http://localhost:$API_PORT"
    echo ""
    echo "# Electric URLs (overrides from root .env)"
    write_env_var "ELECTRIC_URL" "http://localhost:$ELECTRIC_PORT/v1/shape"
    echo "# Caddy HTTPS proxy for HTTP/2 (avoids browser 6-connection limit with 10+ SSE streams)"
    write_env_var "NEXT_PUBLIC_ELECTRIC_URL" "https://localhost:$CADDY_ELECTRIC_PORT/api/electric"
  } >> .env

  success "Workspace .env written"

  # Generate Caddyfile for HTTP/2 reverse proxy (avoids browser 6-connection limit with Electric SSE streams)
  # Caddy proxies to the API server which handles auth and forwards to Electric Docker
  cat > Caddyfile <<-CADDYEOF
	https://localhost:{\$CADDY_ELECTRIC_PORT} {
		reverse_proxy localhost:{\$API_PORT} {
			flush_interval -1
		}
	}
	CADDYEOF
  success "Caddyfile written"

  # Generate .superset/ports.json for static port name mapping in the desktop app
  local superset_dir
  superset_dir="${SUPERSET_SCRIPT_DIR:-$(dirname "$0")}"
  cat > "$superset_dir/ports.json" <<PORTSJSON
{
  "ports": [
    { "port": $WEB_PORT, "label": "Web" },
    { "port": $API_PORT, "label": "API" },
    { "port": $MARKETING_PORT, "label": "Marketing" },
    { "port": $ADMIN_PORT, "label": "Admin" },
    { "port": $DOCS_PORT, "label": "Docs" },
    { "port": $DESKTOP_VITE_PORT, "label": "Desktop Vite" },
    { "port": $DESKTOP_NOTIFICATIONS_PORT, "label": "Notifications" },
    { "port": $ELECTRIC_PORT, "label": "Electric" },
    { "port": $CADDY_ELECTRIC_PORT, "label": "Caddy Electric" },
    { "port": $CODE_INSPECTOR_PORT, "label": "Code Inspector" }
  ]
}
PORTSJSON
  success "Port name mapping written to .superset/ports.json"

  return 0
}

step_seed_local_db() {
  echo "💾 Seeding local DB into superset-dev-data/..."

  local source_db="$HOME/.superset/local.db"
  local dev_data_dir="superset-dev-data"
  local dest_db="$dev_data_dir/local.db"
  local force_overwrite="$FORCE_OVERWRITE_DATA"

  if [ "$force_overwrite" = "1" ] && [ -d "$dev_data_dir" ]; then
    warn "Force overwrite enabled — removing existing $dev_data_dir/"
    if ! rm -rf "$dev_data_dir"; then
      error "Failed to remove existing $dev_data_dir/"
      return 1
    fi
  fi

  if [ ! -f "$source_db" ]; then
    warn "No source local.db found at $source_db — skipping (app will create a fresh one)"
    step_skipped "Seed local DB (no source DB)"
    return 0
  fi

  if [ -f "$dest_db" ] && [ "$force_overwrite" != "1" ]; then
    warn "Destination DB already exists at $dest_db — skipping seed (use -f/--force)"
    step_skipped "Seed local DB (already exists)"
    return 0
  fi

  mkdir -p "$dev_data_dir"
  chmod 700 "$dev_data_dir"

  # Copy all SQLite files so WAL data isn't lost when source is held open.
  for ext in "" "-shm" "-wal"; do
    local source_file="${source_db}${ext}"
    local dest_file="${dest_db}${ext}"

    if [ -f "$source_file" ]; then
      if ! cp "$source_file" "$dest_file"; then
        error "Failed to copy $source_file to $dest_file"
        return 1
      fi
      chmod 600 "$dest_file"
    fi
  done

  # Checkpoint the copy's WAL (no lock contention since nothing else has it open).
  if command -v sqlite3 &> /dev/null; then
    sqlite3 "$dest_db" "PRAGMA wal_checkpoint(TRUNCATE);" &> /dev/null || true
  fi

  success "Local DB seeded from $source_db"
  return 0
}
