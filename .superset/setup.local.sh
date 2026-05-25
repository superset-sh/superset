#!/usr/bin/env bash
# Local-development setup. Provisions a fully self-contained Superset workspace
# backed by a local Postgres container + fake credentials — no Neon account, no
# real third-party keys. Mirrors setup.sh but replaces the cloud/Neon pieces.
set -uo pipefail

SUPERSET_SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SUPERSET_SCRIPT_DIR/.." && pwd)"

# shellcheck source=/dev/null
source "$SUPERSET_SCRIPT_DIR/lib/common.sh"
# shellcheck source=/dev/null
source "$SUPERSET_SCRIPT_DIR/lib/setup/steps.sh" # reuse allocate_port_base + helpers

cd "$ROOT_DIR" || exit 1

# Shared local DB stack — one Postgres/proxy/Electric across all of a
# contributor's worktrees. App ports are still per-workspace (allocate_port_base).
LOCAL_DB_PROJECT="superset-local"
ELECTRIC_HOST_PORT=3100
ELECTRIC_SECRET_VALUE="local_electric_dev_secret"

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
  set -a
  # shellcheck source=/dev/null
  source .env
  set +a
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

local_db_up() {
  echo "🗄️  Starting local DB stack (Postgres + Neon proxy + Electric)..."
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
  local i
  for i in $(seq 1 30); do
    if [ "$(docker inspect --format '{{.State.Health.Status}}' "$container_id" 2>/dev/null)" = "healthy" ]; then
      success "Local DB stack ready"
      return 0
    fi
    sleep 2
  done
  error "Postgres did not become healthy within 60s"
  return 1
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
  echo "📝 Writing workspace ports + URLs to .env..."
  if [ -z "${SUPERSET_PORT_BASE:-}" ]; then
    error "SUPERSET_PORT_BASE not set (port allocation must run first)"
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

  # DATABASE_URL / DATABASE_URL_UNPOOLED stay as written in .env.local.example
  # (local proxy / direct). We only append workspace identity, ports, and URLs.
  {
    echo ""
    echo "# ===== Local workspace overrides (setup.local.sh) ====="
    write_env_var "SUPERSET_WORKSPACE_NAME" "${SUPERSET_WORKSPACE_NAME:-$(basename "$PWD")}"
    write_env_var "SUPERSET_HOME_DIR" "$PWD/superset-dev-data"
    write_env_var "SUPERSET_PORT_BASE" "$BASE"
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
    write_env_var "ELECTRIC_PORT" "$ELECTRIC_HOST_PORT"
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
    echo "# Electric URLs (shared local Electric on :$ELECTRIC_HOST_PORT, fronted by per-workspace Caddy)"
    write_env_var "ELECTRIC_URL" "http://localhost:$ELECTRIC_HOST_PORT/v1/shape"
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
ELECTRIC_SHAPE_URL=http://localhost:$ELECTRIC_HOST_PORT/v1/shape
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
    { "port": $ELECTRIC_HOST_PORT, "label": "Electric" },
    { "port": $CADDY_ELECTRIC_PORT, "label": "Caddy Electric" },
    { "port": $WRANGLER_PORT, "label": "Electric Proxy (Wrangler)" }
  ]
}
PORTSJSON

  success "Workspace .env, Caddyfile, electric-proxy/.dev.vars, ports.json written"
  return 0
}

local_write_config_overlay() {
  echo "🔧 Writing .superset/config.local.json (untracked overlay)..."
  # Gitignored overlay; loadSetupConfig reads it from the main repo path and
  # worktrees aren't consulted, so every Superset worktree of this project runs
  # setup.local.sh — without touching the tracked config.json.
  cat > "$SUPERSET_SCRIPT_DIR/config.local.json" <<'CONFIGLOCAL'
{
  "setup": ["./.superset/setup.local.sh"]
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
  local_db_up || step_failed "Start local DB stack"
  local_migrate || step_failed "Apply migrations"
  local_seed_dev_account || step_failed "Seed dev account"
  allocate_port_base || step_failed "Allocate ports"
  local_write_env || step_failed "Write workspace .env"
  local_write_config_overlay || step_failed "Write config overlay"

  print_summary "Local setup"
}

local_setup_main "$@"
