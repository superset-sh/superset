#!/usr/bin/env bash
# Worktree-local development lifecycle for desktop E2E.
set -euo pipefail

SUPERSET_SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SUPERSET_SCRIPT_DIR/.." && pwd)"
SCRIPT_PATH="$SUPERSET_SCRIPT_DIR/worktree-dev.sh"
RUN_DIR="${SUPERSET_WORKTREE_DEV_RUN_DIR:-$ROOT_DIR/.tmp/worktree-dev}"
LOG_DIR="$RUN_DIR/logs"
TMUX_SOCKET_PATH="${SUPERSET_WORKTREE_DEV_TMUX_SOCKET:-$RUN_DIR/tmux.sock}"
SESSIONS=("api" "relay" "electric-proxy" "desktop")

# shellcheck source=/dev/null
source "$SUPERSET_SCRIPT_DIR/lib/common.sh"

sanitize_name() {
  echo "$1" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9._-]/-/g; s/--*/-/g; s/^-//; s/-$//' | cut -c1-48
}

load_env() {
  if [ -f "$ROOT_DIR/.env" ]; then
    set -a
    # shellcheck source=/dev/null
    source "$ROOT_DIR/.env"
    set +a
  fi

  SUPERSET_WORKSPACE_NAME="${SUPERSET_WORKSPACE_NAME:-$(basename "$ROOT_DIR")}"
  SUPERSET_HOME_DIR="${SUPERSET_HOME_DIR:-$ROOT_DIR/superset-dev-data}"
  SUPERSET_PORT_BASE="${SUPERSET_PORT_BASE:-3000}"
  LOCAL_DB_PROJECT="${LOCAL_DB_PROJECT:-superset-$(sanitize_name "$SUPERSET_WORKSPACE_NAME")}"

  LOCAL_PG_PORT="${LOCAL_PG_PORT:-$((SUPERSET_PORT_BASE + 14))}"
  LOCAL_NEON_PROXY_PORT="${LOCAL_NEON_PROXY_PORT:-$((SUPERSET_PORT_BASE + 15))}"
  LOCAL_ELECTRIC_PORT="${LOCAL_ELECTRIC_PORT:-$((SUPERSET_PORT_BASE + 9))}"
  LOCAL_REDIS_PORT="${LOCAL_REDIS_PORT:-$((SUPERSET_PORT_BASE + 16))}"
  LOCAL_KV_REST_PORT="${LOCAL_KV_REST_PORT:-$((SUPERSET_PORT_BASE + 17))}"

  WEB_PORT="${WEB_PORT:-$SUPERSET_PORT_BASE}"
  API_PORT="${API_PORT:-$((SUPERSET_PORT_BASE + 1))}"
  DESKTOP_VITE_PORT="${DESKTOP_VITE_PORT:-$((SUPERSET_PORT_BASE + 5))}"
  DESKTOP_NOTIFICATIONS_PORT="${DESKTOP_NOTIFICATIONS_PORT:-$((SUPERSET_PORT_BASE + 6))}"
  WRANGLER_PORT="${WRANGLER_PORT:-$((SUPERSET_PORT_BASE + 12))}"
  RELAY_PORT="${RELAY_PORT:-$((SUPERSET_PORT_BASE + 13))}"
  DESKTOP_AUTOMATION_PORT="${DESKTOP_AUTOMATION_PORT:-$((SUPERSET_PORT_BASE + 18))}"

  DATABASE_URL="${DATABASE_URL:-postgres://postgres:postgres@localhost:$LOCAL_NEON_PROXY_PORT/main}"
  DATABASE_URL_UNPOOLED="${DATABASE_URL_UNPOOLED:-postgres://postgres:postgres@localhost:$LOCAL_PG_PORT/main}"
  KV_REST_API_TOKEN="${KV_REST_API_TOKEN:-local-kv-token}"
  KV_REST_API_URL="${KV_REST_API_URL:-http://localhost:$LOCAL_KV_REST_PORT}"
  KV_URL="${KV_URL:-redis://localhost:$LOCAL_REDIS_PORT}"
  ELECTRIC_SECRET="${ELECTRIC_SECRET:-local_electric_dev_secret}"
  ELECTRIC_URL="${ELECTRIC_URL:-http://localhost:$LOCAL_ELECTRIC_PORT/v1/shape}"
  NEXT_PUBLIC_ELECTRIC_URL="${NEXT_PUBLIC_ELECTRIC_URL:-http://localhost:$WRANGLER_PORT}"
  NEXT_PUBLIC_ELECTRIC_PROXY_URL="${NEXT_PUBLIC_ELECTRIC_PROXY_URL:-$NEXT_PUBLIC_ELECTRIC_URL}"
  NEXT_PUBLIC_API_URL="${NEXT_PUBLIC_API_URL:-http://localhost:$API_PORT}"
  NEXT_PUBLIC_DESKTOP_URL="${NEXT_PUBLIC_DESKTOP_URL:-http://localhost:$DESKTOP_VITE_PORT}"
  RELAY_URL="${RELAY_URL:-http://localhost:$RELAY_PORT}"
  NEXT_PUBLIC_RELAY_URL="${NEXT_PUBLIC_RELAY_URL:-$RELAY_URL}"

  export SUPERSET_WORKSPACE_NAME SUPERSET_HOME_DIR SUPERSET_PORT_BASE LOCAL_DB_PROJECT
  export LOCAL_PG_PORT LOCAL_NEON_PROXY_PORT LOCAL_ELECTRIC_PORT LOCAL_REDIS_PORT LOCAL_KV_REST_PORT
  export WEB_PORT API_PORT DESKTOP_VITE_PORT DESKTOP_NOTIFICATIONS_PORT WRANGLER_PORT RELAY_PORT DESKTOP_AUTOMATION_PORT
  export DATABASE_URL DATABASE_URL_UNPOOLED KV_REST_API_TOKEN KV_REST_API_URL KV_URL
  export ELECTRIC_SECRET ELECTRIC_URL NEXT_PUBLIC_ELECTRIC_URL NEXT_PUBLIC_ELECTRIC_PROXY_URL
  export NEXT_PUBLIC_API_URL NEXT_PUBLIC_DESKTOP_URL RELAY_URL NEXT_PUBLIC_RELAY_URL

  mkdir -p "$RUN_DIR" "$LOG_DIR" "$SUPERSET_HOME_DIR"
}

ensure_local_setup() {
  if [ ! -f "$ROOT_DIR/.env" ] || ! grep -q "SUPERSET_HOME_DIR" "$ROOT_DIR/.env"; then
    warn "workspace .env is missing local setup values; running .superset/setup.local.sh"
    "$SUPERSET_SCRIPT_DIR/setup.local.sh"
  fi
  load_env
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || {
    error "missing required command: $1"
    exit 1
  }
}

ensure_prereqs() {
  require_command bun
  require_command curl
  require_command docker
  require_command tmux
  require_command jq
}

wait_for_docker() {
  local max_attempts="${1:-90}"
  local attempt=1
  while ! docker info >/dev/null 2>&1; do
    if [ "$attempt" -ge "$max_attempts" ]; then
      error "Docker/OrbStack is not ready after ${max_attempts} attempts"
      exit 1
    fi
    if [ "$attempt" -eq 1 ]; then
      warn "waiting for Docker/OrbStack..."
    fi
    sleep 2
    attempt=$((attempt + 1))
  done
}

compose() {
  COMPOSE_PROJECT_NAME="$LOCAL_DB_PROJECT" docker compose \
    -p "$LOCAL_DB_PROJECT" \
    -f "$ROOT_DIR/docker-compose.yml" \
    "$@"
}

start_data_services() {
  echo "Starting worktree Docker data services ($LOCAL_DB_PROJECT)..."
  wait_for_docker "${WORKTREE_DEV_DOCKER_WAIT_ATTEMPTS:-180}"
  if ! compose up -d --build --wait postgres neon-proxy electric redis kv-rest; then
    warn "docker compose --wait failed or is unsupported; falling back to detached startup"
    compose up -d --build postgres neon-proxy electric redis kv-rest
  fi
}

db_proxy_query_ok() {
  curl -sS --max-time 5 \
    -X POST "http://localhost:${LOCAL_NEON_PROXY_PORT}/sql" \
    -H "Neon-Connection-String: ${DATABASE_URL}" \
    -H "Content-Type: application/json" \
    -d '{"query":"select 1","params":[]}' 2>/dev/null |
    grep -q '"command"'
}

wait_for_db_proxy_query() {
  local max_attempts="${1:-60}"
  local attempt=1
  while true; do
    if db_proxy_query_ok; then
      success "neon proxy query ready"
      return
    fi
    if [ "$attempt" -ge "$max_attempts" ]; then
      error "neon proxy did not serve SQL queries after ${max_attempts} attempts"
      exit 1
    fi
    if [ "$attempt" -eq 1 ]; then
      warn "waiting for neon proxy SQL queries..."
    fi
    sleep 2
    attempt=$((attempt + 1))
  done
}

run_migrations_and_seed() {
  echo "Applying migrations and ensuring local dev account..."
  NODE_ENV=development bun run --cwd "$ROOT_DIR" db:migrate
  NODE_ENV=development bun run --cwd "$ROOT_DIR" db:seed-dev
}

prepare_desktop() {
  echo "Preparing desktop dev runtime..."
  NODE_ENV=development bun run --cwd "$ROOT_DIR/apps/desktop" predev
}

tmux_session_exists() {
  tmux -S "$TMUX_SOCKET_PATH" has-session -t "$1" >/dev/null 2>&1
}

start_tmux_service() {
  local service="$1"
  if tmux_session_exists "$service"; then
    success "tmux session already running: $service"
    return
  fi

  echo "Starting $service..."
  tmux -S "$TMUX_SOCKET_PATH" new-session -d -s "$service" -c "$ROOT_DIR" \
    "exec '$SCRIPT_PATH' run-service '$service'"
}

start_app_services() {
  for session in "${SESSIONS[@]}"; do
    start_tmux_service "$session"
  done
}

stop_app_services() {
  local session
  for session in "${SESSIONS[@]}"; do
    if tmux_session_exists "$session"; then
      echo "Stopping $session..."
      tmux -S "$TMUX_SOCKET_PATH" kill-session -t "$session" || true
    fi
  done
  if tmux -S "$TMUX_SOCKET_PATH" list-sessions >/dev/null 2>&1; then
    tmux -S "$TMUX_SOCKET_PATH" kill-server >/dev/null 2>&1 || true
  fi
}

stop_data_services() {
  echo "Stopping worktree Docker data services ($LOCAL_DB_PROJECT)..."
  if docker info >/dev/null 2>&1; then
    compose down
  else
    warn "Docker/OrbStack is not reachable; skipping compose down"
  fi
}

run_service() {
  load_env
  local service="${1:-}"
  local log_file="$LOG_DIR/${service}.log"
  exec > >(tee -a "$log_file") 2>&1
  echo "[worktree-dev] service=$service started at $(date -u '+%Y-%m-%dT%H:%M:%SZ')"

  case "$service" in
    api)
      cd "$ROOT_DIR/apps/api"
      rm -rf "${SUPERSET_NEXT_DIST_DIR:-.next}"
      exec ./node_modules/.bin/next dev --port "$API_PORT"
      ;;
    relay)
      cd "$ROOT_DIR/apps/relay"
      exec bun --hot src/index.ts
      ;;
    electric-proxy)
      cd "$ROOT_DIR/apps/electric-proxy"
      exec bunx wrangler dev \
        --port "$WRANGLER_PORT" \
        --persist-to "$RUN_DIR/wrangler-state" \
        --env-file "$ROOT_DIR/apps/electric-proxy/.dev.vars"
      ;;
    desktop)
      cd "$ROOT_DIR/apps/desktop"
      export NODE_ENV=development
      export NODE_OPTIONS=--max-old-space-size=8192
      export DESKTOP_AUTOMATION_PORT
      exec ./node_modules/.bin/electron-vite dev --watch
      ;;
    *)
      error "unknown service: $service"
      exit 1
      ;;
  esac
}

probe_url() {
  local label="$1"
  local url="$2"
  local expected="$3"
  local status
  status="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 8 "$url" 2>/dev/null || true)"
  if [ "$status" = "$expected" ]; then
    printf '  ✓ %-24s %s %s\n' "$label" "$status" "$url"
  else
    printf '  ✗ %-24s got %s expected %s %s\n' "$label" "${status:-000}" "$expected" "$url"
  fi
}

wait_for_probe() {
  local label="$1"
  local url="$2"
  local expected="$3"
  local max_attempts="${4:-60}"
  local attempt=1
  local status

  while true; do
    status="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 8 "$url" 2>/dev/null || true)"
    if [ "$status" = "$expected" ]; then
      success "$label ready ($status)"
      return
    fi
    if [ "$attempt" -ge "$max_attempts" ]; then
      error "$label did not become ready; got ${status:-000}, expected $expected at $url"
      exit 1
    fi
    sleep 2
    attempt=$((attempt + 1))
  done
}

wait_for_desktop_automation() {
  local max_attempts="${1:-90}"
  local attempt=1
  while true; do
    if DESKTOP_AUTOMATION_PORT="$DESKTOP_AUTOMATION_PORT" bun run --cwd "$ROOT_DIR" desktop:automation -- window-info --json >/dev/null 2>&1; then
      success "desktop automation ready (:${DESKTOP_AUTOMATION_PORT})"
      return
    fi
    if ! tmux_session_exists "desktop"; then
      error "desktop session exited before automation became ready; inspect $LOG_DIR/desktop.log"
      exit 1
    fi
    if [ "$attempt" -ge "$max_attempts" ]; then
      error "desktop automation did not become ready on port ${DESKTOP_AUTOMATION_PORT}"
      exit 1
    fi
    sleep 2
    attempt=$((attempt + 1))
  done
}

wait_for_local_services() {
  echo "Waiting for app service readiness..."
  wait_for_probe "api session" "http://localhost:${API_PORT}/api/auth/get-session" "200"
  wait_for_probe "relay health" "http://localhost:${RELAY_PORT}/health" "200"
  wait_for_probe "electric auth gate" "http://localhost:${WRANGLER_PORT}/v1/shape" "401"
  wait_for_desktop_automation
}

print_tmux_status() {
  echo "tmux socket: $TMUX_SOCKET_PATH"
  local session
  for session in "${SESSIONS[@]}"; do
    if tmux_session_exists "$session"; then
      printf '  ✓ %s\n' "$session"
    else
      printf '  ✗ %s\n' "$session"
    fi
  done
}

print_docker_status() {
  echo "docker compose project: $LOCAL_DB_PROJECT"
  if docker info >/dev/null 2>&1; then
    compose ps
  else
    echo "  Docker/OrbStack is not reachable"
  fi
}

print_status() {
  load_env
  echo "worktree: $SUPERSET_WORKSPACE_NAME"
  echo "home:     $SUPERSET_HOME_DIR"
  echo "logs:     $LOG_DIR"
  echo
  echo "ports:"
  echo "  api              http://localhost:${API_PORT}"
  echo "  relay            http://localhost:${RELAY_PORT}"
  echo "  electric-proxy   http://localhost:${WRANGLER_PORT}"
  echo "  desktop vite     http://localhost:${DESKTOP_VITE_PORT}"
  echo "  desktop cdp      http://localhost:${DESKTOP_AUTOMATION_PORT}"
  echo "  postgres         localhost:${LOCAL_PG_PORT}"
  echo "  neon-proxy       localhost:${LOCAL_NEON_PROXY_PORT}"
  echo "  electric         localhost:${LOCAL_ELECTRIC_PORT}"
  echo "  redis            localhost:${LOCAL_REDIS_PORT}"
  echo "  kv-rest          localhost:${LOCAL_KV_REST_PORT}"
  echo
  print_tmux_status
  echo
  print_docker_status
  echo
  echo "probes:"
  if db_proxy_query_ok; then
    printf '  ✓ %-24s %s\n' "neon proxy SQL" "SELECT"
  else
    printf '  ✗ %-24s failed %s\n' "neon proxy SQL" "http://localhost:${LOCAL_NEON_PROXY_PORT}/sql"
  fi
  probe_url "api session" "http://localhost:${API_PORT}/api/auth/get-session" "200"
  probe_url "relay health" "http://localhost:${RELAY_PORT}/health" "200"
  probe_url "electric auth gate" "http://localhost:${WRANGLER_PORT}/v1/shape" "401"
  if DESKTOP_AUTOMATION_PORT="$DESKTOP_AUTOMATION_PORT" bun run --cwd "$ROOT_DIR" desktop:automation -- window-info --json >/dev/null 2>&1; then
    printf '  ✓ %-24s %s\n' "desktop automation" "connected"
  else
    printf '  ✗ %-24s failed %s\n' "desktop automation" "port ${DESKTOP_AUTOMATION_PORT}"
  fi
}

cleanup_fixture() {
  local mode="$1"
  local value="$2"
  local fixture_output
  fixture_output="$(bun run --cwd "$ROOT_DIR" e2e:workspace-fixture -- cleanup "--$mode" "$value")"
  echo "$fixture_output" >&2
  echo "$fixture_output" | jq -r '.cleanupCandidates[]?'
}

remove_candidate_dirs() {
  local dry_run="$1"
  shift
  local candidates=("$@")
  local roots=(
    "$HOME/.superset/worktrees"
    "$SUPERSET_HOME_DIR/worktrees"
    "$SUPERSET_HOME_DIR/repos"
    "$SUPERSET_HOME_DIR/clones"
  )
  local root candidate target
  for candidate in "${candidates[@]}"; do
    [ -n "$candidate" ] || continue
    case "$candidate" in
      "."|".."|"/"|*"/"*|"~"*) continue ;;
    esac
    for root in "${roots[@]}"; do
      target="$root/$candidate"
      if [ -e "$target" ]; then
        if [ "$dry_run" = "1" ]; then
          echo "dry-run remove $target"
        else
          echo "removing $target"
          rm -rf "$target"
        fi
      fi
    done
  done
}

cleanup_all() {
  load_env
  ensure_prereqs

  local dry_run=0
  local slugs=()
  local ids=()
  local explicit_candidates=()

  while [ "$#" -gt 0 ]; do
    case "$1" in
      --dry-run)
        dry_run=1
        shift
        ;;
      --e2e-slug|--slug)
        slugs+=("${2:?missing slug}")
        shift 2
        ;;
      --e2e-id|--id)
        ids+=("${2:?missing id}")
        shift 2
        ;;
      --worktree-name|--dir-name)
        explicit_candidates+=("${2:?missing directory name}")
        shift 2
        ;;
      *)
        error "unknown cleanup option: $1"
        exit 1
        ;;
    esac
  done

  if [ "$dry_run" = "1" ]; then
    warn "dry run: services will not be stopped and files will not be deleted"
  else
    stop_app_services
    trap 'stop_data_services' EXIT
  fi

  local candidates=("${explicit_candidates[@]}")
  local slug id candidate
  if [ "$dry_run" = "0" ]; then
    if [ "${#slugs[@]}" -gt 0 ]; then
      for slug in "${slugs[@]}"; do
        while IFS= read -r candidate; do
          candidates+=("$candidate")
        done < <(cleanup_fixture "slug" "$slug")
      done
    fi
    if [ "${#ids[@]}" -gt 0 ]; then
      for id in "${ids[@]}"; do
        while IFS= read -r candidate; do
          candidates+=("$candidate")
        done < <(cleanup_fixture "id" "$id")
      done
    fi
  else
    if [ "${#slugs[@]}" -gt 0 ]; then
      for slug in "${slugs[@]}"; do
        candidates+=("$slug")
      done
    fi
    if [ "${#ids[@]}" -gt 0 ]; then
      for id in "${ids[@]}"; do
        candidates+=("$id")
      done
    fi
  fi

  if [ "${#candidates[@]}" -gt 0 ]; then
    remove_candidate_dirs "$dry_run" "${candidates[@]}"
  fi

  if [ "$dry_run" = "0" ]; then
    stop_data_services
    trap - EXIT
  fi
}

start_all() {
  ensure_local_setup
  ensure_prereqs
  start_data_services
  wait_for_db_proxy_query
  run_migrations_and_seed
  prepare_desktop
  start_app_services
  wait_for_local_services
  print_status
}

stop_all() {
  load_env
  ensure_prereqs
  stop_app_services
  stop_data_services
}

usage() {
  cat <<USAGE
Usage: $0 <command> [options]

Commands:
  start                         Start this worktree's Docker, API, Relay, Electric proxy, and Desktop app
  status                        Print sessions, ports, Docker state, and readiness probes
  stop                          Stop only this worktree's sessions and Docker compose project
  cleanup [options]             Stop services and remove optional E2E fixture state/directories
  run-service <service>         Internal tmux entrypoint
  help                          Show this help

Cleanup options:
  --e2e-slug <slug>             Delete matching fixture project/workspace rows and local dirs
  --e2e-id <id>                 Delete matching fixture project/workspace rows and local dirs
  --worktree-name <name>        Also remove this local worktree directory name
  --dry-run                     Print intended local directory removals without stopping/deleting
USAGE
}

main() {
  local command="${1:-status}"
  case "$command" in
    start)
      start_all
      ;;
    status)
      load_env
      ensure_prereqs
      print_status
      ;;
    stop)
      stop_all
      ;;
    cleanup)
      shift
      cleanup_all "$@"
      ;;
    run-service)
      run_service "${2:-}"
      ;;
    help|-h|--help)
      usage
      ;;
    *)
      usage
      error "unknown command: $command"
      exit 1
      ;;
  esac
}

main "$@"
