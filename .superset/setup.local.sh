#!/usr/bin/env bash
# Local-development setup. Provisions a fully self-contained, PER-WORKSPACE
# Superset stack backed by a local Postgres container + fake credentials — no
# Neon account, no real third-party keys. Mirrors setup.sh, but replaces the
# Neon branch with a docker-compose bundle (Postgres + neon-proxy + Electric)
# on per-workspace allocated ports so multiple worktrees never collide.
set -uo pipefail

SUPERSET_SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SUPERSET_SCRIPT_DIR/.." && pwd)"

# shellcheck source=/dev/null
source "$SUPERSET_SCRIPT_DIR/lib/common.sh"
# shellcheck source=/dev/null
source "$SUPERSET_SCRIPT_DIR/lib/setup/steps.sh" # reuse allocate_port_base + helpers

cd "$ROOT_DIR" || exit 1

ELECTRIC_SECRET_VALUE="local_electric_dev_secret"

# Set by local_allocate_ports; consumed by docker compose + .env writing.
LOCAL_DB_PROJECT=""
LOCAL_PG_PORT=""
LOCAL_NEON_PROXY_PORT=""
LOCAL_ELECTRIC_PORT=""

sanitize_name() {
  echo "$1" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9._-]/-/g; s/--*/-/g; s/^-//; s/-$//' | cut -c1-48
}

local_ensure_env() {
  echo "📂 Preparing .env..."
  if [ ! -f .env ]; then
    if [ ! -f .env.local.example ]; then
      error ".env.local.example not found in $ROOT_DIR"
      return 1
    fi
    cp .env.local.example .env
    success "Created .env from .env.local.example"
  else
    success ".env already exists — leaving as-is"
  fi
  return 0
}

local_check_dependencies() {
  echo "🔍 Checking dependencies..."
  local missing=()
  command -v bun &> /dev/null || missing+=("bun (https://bun.sh)")
  command -v docker &> /dev/null || missing+=("docker (https://docker.com)")
  command -v jq &> /dev/null || missing+=("jq (brew install jq)")
  command -v caddy &> /dev/null || warn "caddy not found — Electric HTTPS proxy won't work (brew install caddy && caddy trust)"
  if [ ${#missing[@]} -gt 0 ]; then
    error "Missing dependencies:"
    for dep in "${missing[@]}"; do echo "  - $dep"; done
    return 1
  fi
  success "All dependencies found"
  return 0
}

local_allocate_ports() {
  echo "🔌 Allocating per-workspace ports..."
  if ! allocate_port_base; then
    error "Port allocation failed"
    return 1
  fi
  local base="$SUPERSET_PORT_BASE"
  # DB stack host ports live in the free tail of the 20-port window
  # (app ports use +0..+13; Electric reuses the +9 ELECTRIC_PORT slot).
  LOCAL_PG_PORT=$((base + 14))
  LOCAL_NEON_PROXY_PORT=$((base + 15))
  LOCAL_ELECTRIC_PORT=$((base + 9))
  export LOCAL_PG_PORT LOCAL_NEON_PROXY_PORT LOCAL_ELECTRIC_PORT
  # Export so migrate/seed (child bun processes) use these — an inherited env
  # var beats the .env file, so this overrides any stale DATABASE_URL.
  export DATABASE_URL="postgres://postgres:postgres@db.localtest.me:$LOCAL_NEON_PROXY_PORT/main"
  export DATABASE_URL_UNPOOLED="postgres://postgres:postgres@localhost:$LOCAL_PG_PORT/main"
  LOCAL_DB_PROJECT="superset-$(sanitize_name "${SUPERSET_WORKSPACE_NAME:-$(basename "$PWD")}")"
  success "Base $base → pg=$LOCAL_PG_PORT proxy=$LOCAL_NEON_PROXY_PORT electric=$LOCAL_ELECTRIC_PORT (project $LOCAL_DB_PROJECT)"
  return 0
}

local_db_up() {
  echo "🗄️  Starting per-workspace DB stack ($LOCAL_DB_PROJECT)..."
  if ! docker compose -p "$LOCAL_DB_PROJECT" -f "$ROOT_DIR/docker-compose.yml" up -d; then
    error "docker compose up failed"
    return 1
  fi
  echo "  Waiting for Postgres to be healthy..."
  local container_id
  container_id="$(docker compose -p "$LOCAL_DB_PROJECT" -f "$ROOT_DIR/docker-compose.yml" ps -q postgres 2>/dev/null)"
  if [ -z "$container_id" ]; then
    error "Postgres container not found"
    return 1
  fi
  local i pg_ready=0
  for i in $(seq 1 30); do
    if [ "$(docker inspect --format '{{.State.Health.Status}}' "$container_id" 2>/dev/null)" = "healthy" ]; then
      pg_ready=1
      break
    fi
    sleep 2
  done
  if [ "$pg_ready" -ne 1 ]; then
    error "Postgres did not become healthy within 60s"
    return 1
  fi

  # Postgres health != proxy ready. migrate uses direct pg, but seed (and the
  # app) query through the neon-http proxy, which starts + bootstraps a beat
  # later. Probe a real query so the seed never races a cold proxy.
  echo "  Waiting for neon-proxy to serve queries on :$LOCAL_NEON_PROXY_PORT..."
  local j proxy_ready=0
  for j in $(seq 1 30); do
    if curl -s --max-time 3 -X POST "http://localhost:$LOCAL_NEON_PROXY_PORT/sql" \
        -H "Neon-Connection-String: postgres://postgres:postgres@db.localtest.me:$LOCAL_NEON_PROXY_PORT/main" \
        -H "Content-Type: application/json" \
        -d '{"query":"select 1","params":[]}' 2>/dev/null | grep -q '"command"'; then
      proxy_ready=1
      break
    fi
    sleep 1
  done
  if [ "$proxy_ready" -ne 1 ]; then
    error "neon-proxy did not become ready within 30s"
    return 1
  fi

  success "DB stack ready (pg :$LOCAL_PG_PORT, proxy :$LOCAL_NEON_PROXY_PORT, electric :$LOCAL_ELECTRIC_PORT)"
  return 0
}

local_migrate() {
  echo "📜 Applying database migrations..."
  if ! bun run db:migrate; then
    error "db:migrate failed"
    return 1
  fi
  success "Migrations applied"
  return 0
}

local_seed_dev_account() {
  echo "🌱 Seeding dev account (onboarded + pro)..."
  if ! bun run db:seed-dev; then
    error "db:seed-dev failed"
    return 1
  fi
  success "Dev account ready (sign in via the dev button)"
  return 0
}

local_write_env() {
  echo "📝 Writing workspace .env (DB URLs + ports)..."
  if [ -z "${SUPERSET_PORT_BASE:-}" ] || [ -z "$LOCAL_NEON_PROXY_PORT" ]; then
    error "Ports not allocated before writing .env"
    return 1
  fi

  local BASE="$SUPERSET_PORT_BASE"
  local WEB_PORT=$((BASE))
  local API_PORT=$((BASE + 1))
  local MARKETING_PORT=$((BASE + 2))
  local ADMIN_PORT=$((BASE + 3))
  local DOCS_PORT=$((BASE + 4))
  local DESKTOP_VITE_PORT=$((BASE + 5))
  local DESKTOP_NOTIFICATIONS_PORT=$((BASE + 6))
  local STREAMS_PORT=$((BASE + 7))
  local STREAMS_INTERNAL_PORT=$((BASE + 8))
  local CADDY_ELECTRIC_PORT=$((BASE + 10))
  local CODE_INSPECTOR_PORT=$((BASE + 11))
  local WRANGLER_PORT=$((BASE + 12))
  local RELAY_PORT=$((BASE + 13))

  {
    echo ""
    echo "# ===== Local workspace overrides (setup.local.sh) ====="
    write_env_var "SUPERSET_WORKSPACE_NAME" "${SUPERSET_WORKSPACE_NAME:-$(basename "$PWD")}"
    write_env_var "SUPERSET_HOME_DIR" "$PWD/superset-dev-data"
    write_env_var "SUPERSET_PORT_BASE" "$BASE"
    echo ""
    echo "# Per-workspace local DB stack (docker compose project $LOCAL_DB_PROJECT)"
    write_env_var "LOCAL_PG_PORT" "$LOCAL_PG_PORT"
    write_env_var "LOCAL_NEON_PROXY_PORT" "$LOCAL_NEON_PROXY_PORT"
    write_env_var "LOCAL_ELECTRIC_PORT" "$LOCAL_ELECTRIC_PORT"
    write_env_var "DATABASE_URL" "$DATABASE_URL"
    write_env_var "DATABASE_URL_UNPOOLED" "$DATABASE_URL_UNPOOLED"
    echo ""
    echo "# Workspace ports"
    write_env_var "WEB_PORT" "$WEB_PORT"
    write_env_var "API_PORT" "$API_PORT"
    write_env_var "MARKETING_PORT" "$MARKETING_PORT"
    write_env_var "ADMIN_PORT" "$ADMIN_PORT"
    write_env_var "DOCS_PORT" "$DOCS_PORT"
    write_env_var "DESKTOP_VITE_PORT" "$DESKTOP_VITE_PORT"
    write_env_var "DESKTOP_NOTIFICATIONS_PORT" "$DESKTOP_NOTIFICATIONS_PORT"
    write_env_var "STREAMS_PORT" "$STREAMS_PORT"
    write_env_var "STREAMS_INTERNAL_PORT" "$STREAMS_INTERNAL_PORT"
    write_env_var "CADDY_ELECTRIC_PORT" "$CADDY_ELECTRIC_PORT"
    write_env_var "CODE_INSPECTOR_PORT" "$CODE_INSPECTOR_PORT"
    write_env_var "WRANGLER_PORT" "$WRANGLER_PORT"
    write_env_var "RELAY_PORT" "$RELAY_PORT"
    write_env_var "ELECTRIC_PORT" "$LOCAL_ELECTRIC_PORT"
    write_env_var "ELECTRIC_SECRET" "$ELECTRIC_SECRET_VALUE"
    echo ""
    echo "# Cross-app URLs (allocated ports)"
    write_env_var "NEXT_PUBLIC_API_URL" "http://localhost:$API_PORT"
    write_env_var "NEXT_PUBLIC_WEB_URL" "http://localhost:$WEB_PORT"
    write_env_var "NEXT_PUBLIC_MARKETING_URL" "http://localhost:$MARKETING_PORT"
    write_env_var "NEXT_PUBLIC_ADMIN_URL" "http://localhost:$ADMIN_PORT"
    write_env_var "NEXT_PUBLIC_DOCS_URL" "http://localhost:$DOCS_PORT"
    write_env_var "NEXT_PUBLIC_DESKTOP_URL" "http://localhost:$DESKTOP_VITE_PORT"
    write_env_var "RELAY_URL" "http://localhost:$RELAY_PORT"
    write_env_var "NEXT_PUBLIC_RELAY_URL" "http://localhost:$RELAY_PORT"
    write_env_var "SUPERSET_WEB_URL" "http://localhost:$WEB_PORT"
    echo ""
    echo "# Streams URLs"
    write_env_var "PORT" "$STREAMS_PORT"
    write_env_var "STREAMS_URL" "http://localhost:$STREAMS_PORT"
    write_env_var "NEXT_PUBLIC_STREAMS_URL" "http://localhost:$STREAMS_PORT"
    write_env_var "STREAMS_INTERNAL_URL" "http://127.0.0.1:$STREAMS_INTERNAL_PORT"
    echo ""
    echo "# Electric URLs (per-workspace Electric :$LOCAL_ELECTRIC_PORT, fronted by Caddy)"
    write_env_var "ELECTRIC_URL" "http://localhost:$LOCAL_ELECTRIC_PORT/v1/shape"
    write_env_var "NEXT_PUBLIC_ELECTRIC_URL" "https://localhost:$CADDY_ELECTRIC_PORT"
    write_env_var "NEXT_PUBLIC_ELECTRIC_PROXY_URL" "https://localhost:$CADDY_ELECTRIC_PORT"
  } >> .env

  cat > Caddyfile <<-CADDYEOF
	{
		auto_https disable_redirects
	}

	https://localhost:{\$CADDY_ELECTRIC_PORT} {
		reverse_proxy localhost:{\$WRANGLER_PORT} {
			flush_interval -1
		}
	}
	CADDYEOF

  cat > apps/electric-proxy/.dev.vars <<DEVVARS
AUTH_URL=http://localhost:$API_PORT
ELECTRIC_SHAPE_URL=http://localhost:$LOCAL_ELECTRIC_PORT/v1/shape
ELECTRIC_SECRET=$ELECTRIC_SECRET_VALUE
ELECTRIC_SOURCE_ID=
ELECTRIC_SOURCE_SECRET=
DEVVARS

  cat > "$SUPERSET_SCRIPT_DIR/ports.json" <<PORTSJSON
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
    { "port": $LOCAL_ELECTRIC_PORT, "label": "Electric" },
    { "port": $CADDY_ELECTRIC_PORT, "label": "Caddy Electric" },
    { "port": $WRANGLER_PORT, "label": "Electric Proxy (Wrangler)" },
    { "port": $LOCAL_PG_PORT, "label": "Postgres" },
    { "port": $LOCAL_NEON_PROXY_PORT, "label": "Neon Proxy" }
  ]
}
PORTSJSON

  success "Workspace .env, Caddyfile, electric-proxy/.dev.vars, ports.json written"
  return 0
}

local_write_config_overlay() {
  echo "🔧 Writing .superset/config.local.json (untracked overlay)..."
  cat > "$SUPERSET_SCRIPT_DIR/config.local.json" <<'CONFIGLOCAL'
{
  "setup": ["./.superset/setup.local.sh"],
  "teardown": ["./.superset/teardown.local.sh"]
}
CONFIGLOCAL
  success "config.local.json written — worktrees will use setup.local.sh"
  return 0
}

local_setup_main() {
  FAILED_STEPS=()
  SKIPPED_STEPS=()

  echo "🚀 Setting up Superset for LOCAL development..."
  echo ""

  local_ensure_env || step_failed "Prepare .env"
  local_check_dependencies || step_failed "Check dependencies"
  step_install_dependencies || step_failed "Install dependencies"
  local_allocate_ports || step_failed "Allocate ports"
  local_write_env || step_failed "Write workspace .env"
  local_db_up || step_failed "Start local DB stack"
  local_migrate || step_failed "Apply migrations"
  local_seed_dev_account || step_failed "Seed dev account"
  local_write_config_overlay || step_failed "Write config overlay"

  print_summary "Local setup"
}

local_setup_main "$@"
