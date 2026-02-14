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

# Validate JSON output before parsing
validate_json() {
  local output="$1"
  local error_context="${2:-JSON validation}"

  if [ -z "$output" ]; then
    error "$error_context: Empty output"
    return 1
  fi

  if ! echo "$output" | jq empty 2>/dev/null; then
    error "$error_context: Invalid JSON output"
    echo "Raw output:" >&2
    echo "$output" >&2
    return 1
  fi

  return 0
}

# Print summary at the end
print_summary() {
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "📊 Setup Summary"
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

  # Use reserved port from SUPERSET_PORT_BASE if available, otherwise auto-assign
  local port_flag
  if [ -n "${SUPERSET_PORT_BASE:-}" ]; then
    ELECTRIC_PORT=$((SUPERSET_PORT_BASE + 9))
    port_flag="-p $ELECTRIC_PORT:3000"
  else
    port_flag="-p 3000"
  fi

  if ! docker run -d \
      --name "$ELECTRIC_CONTAINER" \
      $port_flag \
      -e DATABASE_URL="$DIRECT_URL" \
      -e ELECTRIC_SECRET="$ELECTRIC_SECRET" \
      electricsql/electric:latest &> /dev/null; then
    error "Failed to start Electric container"
    return 1
  fi

  # Resolve actual port (needed when auto-assigned)
  if [ -z "${ELECTRIC_PORT:-}" ]; then
    ELECTRIC_PORT=$(docker port "$ELECTRIC_CONTAINER" 3000 | cut -d: -f2)
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
    echo "SUPERSET_WORKSPACE_NAME=${WORKSPACE_NAME:-$(basename "$PWD")}"
    echo ""
    echo "# Workspace Database (Neon Branch)"
    if [ -n "${BRANCH_ID:-}" ]; then
      echo "NEON_BRANCH_ID=$BRANCH_ID"
    fi
    if [ -n "${POOLED_URL:-}" ]; then
      echo "DATABASE_URL=$POOLED_URL"
    fi
    if [ -n "${DIRECT_URL:-}" ]; then
      echo "DATABASE_URL_UNPOOLED=$DIRECT_URL"
    fi

    echo ""
    echo "# Workspace Electric SQL (Docker)"
    if [ -n "${ELECTRIC_CONTAINER:-}" ]; then
      echo "ELECTRIC_CONTAINER=$ELECTRIC_CONTAINER"
    fi
    if [ -n "${ELECTRIC_PORT:-}" ]; then
      echo "ELECTRIC_PORT=$ELECTRIC_PORT"
    fi
    if [ -n "${ELECTRIC_URL:-}" ]; then
      echo "ELECTRIC_URL=$ELECTRIC_URL"
    fi
    if [ -n "${ELECTRIC_SECRET:-}" ]; then
      echo "ELECTRIC_SECRET=$ELECTRIC_SECRET"
    fi

    # Port allocation for multi-worktree dev instances
    # Each workspace gets a range of 20 ports from its base.
    # Offsets: +0 web, +1 api, +2 marketing, +3 admin, +4 docs,
    #          +5 desktop vite, +6 notifications, +7 streams, +8 streams internal, +9 electric,
    #          +10 caddy (HTTP/2 reverse proxy for electric-proxy), +11 code inspector, +12 electric-proxy (wrangler dev)
    if [ -n "${SUPERSET_PORT_BASE:-}" ]; then
      local BASE=$SUPERSET_PORT_BASE

      # App ports (fixed offsets from base)
      local WEB_PORT=$((BASE))
      local API_PORT=$((BASE + 1))
      local MARKETING_PORT=$((BASE + 2))
      local ADMIN_PORT=$((BASE + 3))
      local DOCS_PORT=$((BASE + 4))
      local DESKTOP_VITE_PORT=$((BASE + 5))
      local DESKTOP_NOTIFICATIONS_PORT=$((BASE + 6))
      local STREAMS_PORT=$((BASE + 7))
      local STREAMS_INTERNAL_PORT=$((BASE + 8))
      local ELECTRIC_PORT=$((BASE + 9))
      local CADDY_ELECTRIC_PORT=$((BASE + 10))
      local CODE_INSPECTOR_PORT=$((BASE + 11))
      local ELECTRIC_PROXY_PORT=$((BASE + 12))

      echo ""
      echo "# Workspace Ports (allocated from SUPERSET_PORT_BASE=$BASE, range=20)"
      echo "SUPERSET_PORT_BASE=$BASE"
      echo "WEB_PORT=$WEB_PORT"
      echo "API_PORT=$API_PORT"
      echo "MARKETING_PORT=$MARKETING_PORT"
      echo "ADMIN_PORT=$ADMIN_PORT"
      echo "DOCS_PORT=$DOCS_PORT"
      echo "DESKTOP_VITE_PORT=$DESKTOP_VITE_PORT"
      echo "DESKTOP_NOTIFICATIONS_PORT=$DESKTOP_NOTIFICATIONS_PORT"
      echo "STREAMS_PORT=$STREAMS_PORT"
      echo "STREAMS_INTERNAL_PORT=$STREAMS_INTERNAL_PORT"
      echo "ELECTRIC_PORT=$ELECTRIC_PORT"
      echo "CADDY_ELECTRIC_PORT=$CADDY_ELECTRIC_PORT"
      echo "CODE_INSPECTOR_PORT=$CODE_INSPECTOR_PORT"
      echo "ELECTRIC_PROXY_PORT=$ELECTRIC_PROXY_PORT"
      echo ""
      echo "# Cross-app URLs (overrides from root .env)"
      echo "NEXT_PUBLIC_API_URL=http://localhost:$API_PORT"
      echo "NEXT_PUBLIC_WEB_URL=http://localhost:$WEB_PORT"
      echo "NEXT_PUBLIC_MARKETING_URL=http://localhost:$MARKETING_PORT"
      echo "NEXT_PUBLIC_ADMIN_URL=http://localhost:$ADMIN_PORT"
      echo "NEXT_PUBLIC_DOCS_URL=http://localhost:$DOCS_PORT"
      echo "NEXT_PUBLIC_DESKTOP_URL=http://localhost:$DESKTOP_VITE_PORT"
      echo "EXPO_PUBLIC_WEB_URL=http://localhost:$WEB_PORT"
      echo "EXPO_PUBLIC_API_URL=http://localhost:$API_PORT"
      echo ""
      echo "# Streams URLs (overrides from root .env)"
      echo "PORT=$STREAMS_PORT"
      echo "STREAMS_URL=http://localhost:$STREAMS_PORT"
      echo "NEXT_PUBLIC_STREAMS_URL=http://localhost:$STREAMS_PORT"
      echo "EXPO_PUBLIC_STREAMS_URL=http://localhost:$STREAMS_PORT"
      echo "STREAMS_INTERNAL_URL=http://127.0.0.1:$STREAMS_INTERNAL_PORT"
      echo ""
      echo "# Electric URLs (overrides from root .env)"
      echo "ELECTRIC_URL=http://localhost:$ELECTRIC_PORT/v1/shape"
      echo "# Caddy HTTPS proxy for HTTP/2 (avoids browser 6-connection limit with 10+ SSE streams)"
      echo "NEXT_PUBLIC_ELECTRIC_URL=https://localhost:$CADDY_ELECTRIC_PORT"
    fi
  } >> .env

  success "Workspace .env written"

  # Generate Electric proxy .dev.vars for wrangler dev
  local api_port="${API_PORT:-3041}"
  local electric_port="${ELECTRIC_PORT:-3049}"
  cat > apps/electric-proxy/.dev.vars <<DEVVARS
ELECTRIC_URL=http://localhost:${electric_port}/v1/shape
ELECTRIC_SECRET=${ELECTRIC_SECRET:-local_electric_dev_secret}
JWKS_URL=http://localhost:${api_port}/api/auth/jwks
JWT_ISSUER=http://localhost:${api_port}
JWT_AUDIENCE=http://localhost:${api_port}
DEVVARS
  success "Electric proxy .dev.vars written"

  # Generate Caddyfile for HTTP/2 reverse proxy (avoids browser 6-connection limit with Electric SSE streams)
  cat > Caddyfile <<CADDYEOF
https://localhost:{\$CADDY_ELECTRIC_PORT} {
	reverse_proxy localhost:{\$ELECTRIC_PROXY_PORT} {
		flush_interval -1
	}
}
CADDYEOF
  success "Caddyfile written"

  # Generate .superset/ports.json for static port name mapping in the desktop app
  if [ -n "${SUPERSET_PORT_BASE:-}" ]; then
    local superset_dir
    superset_dir="$(dirname "$0")"
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
    { "port": $STREAMS_PORT, "label": "Streams" },
    { "port": $STREAMS_INTERNAL_PORT, "label": "Streams Internal" },
    { "port": $ELECTRIC_PORT, "label": "Electric" },
    { "port": $CADDY_ELECTRIC_PORT, "label": "Caddy Electric" },
    { "port": $CODE_INSPECTOR_PORT, "label": "Code Inspector" },
    { "port": $ELECTRIC_PROXY_PORT, "label": "Electric Proxy" }
  ]
}
PORTSJSON
    success "Port name mapping written to .superset/ports.json"
  fi

  return 0
}

main() {
  echo "🚀 Setting up Superset workspace..."
  echo ""

  # Step 1: Load environment
  if ! step_load_env; then
    step_failed "Load environment variables"
  fi

  # Step 2: Check dependencies
  if ! step_check_dependencies; then
    step_failed "Check dependencies"
  fi

  # Step 3: Install dependencies
  if ! step_install_dependencies; then
    step_failed "Install dependencies"
  fi

  # Step 4: Setup Neon branch
  if ! step_setup_neon_branch; then
    step_failed "Setup Neon branch"
  fi

  # Step 5: Start Electric SQL
  if ! step_start_electric; then
    step_failed "Start Electric SQL"
  fi

  # Step 6: Write .env file
  if ! step_write_env; then
    step_failed "Write .env file"
  fi

  # Print summary and exit with appropriate code
  print_summary
}

main "$@"
