#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEFAULT_ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
ROOT_DIR="${SUPERSET_ONLINE_ROOT_DIR:-$DEFAULT_ROOT_DIR}"
SCRIPT_PATH="${SUPERSET_ONLINE_SCRIPT_PATH:-$SCRIPT_DIR/superset-online.sh}"
RUN_DIR="${SUPERSET_ONLINE_RUN_DIR:-$ROOT_DIR/.tmp/online-service}"
LOG_DIR="$RUN_DIR/logs"
BASE_ENV_PATH="${SUPERSET_ONLINE_ENV_FILE:-$ROOT_DIR/.env}"
LAUNCH_AGENT_LABEL="com.superset.online"
LAUNCH_AGENT_PATH="$HOME/Library/LaunchAgents/${LAUNCH_AGENT_LABEL}.plist"
LAUNCH_SUPPORT_DIR="$HOME/Library/Application Support/Superset"
LAUNCHER_PATH="$LAUNCH_SUPPORT_DIR/superset-online-launcher.sh"
LAUNCH_SCRIPT_PATH="$LAUNCH_SUPPORT_DIR/superset-online.sh"
LAUNCH_ENV_PATH="$LAUNCH_SUPPORT_DIR/superset-online.env"
TMUX_SOCKET_PATH="${SUPERSET_ONLINE_TMUX_SOCKET:-$LAUNCH_SUPPORT_DIR/online-tmux.sock}"
COMPOSE_PROJECT_NAME="superset-online"

ONLINE_WEB_PORT="43000"
ONLINE_API_PORT="43001"
ONLINE_ELECTRIC_PROXY_PORT="43012"
ONLINE_RELAY_PORT="43013"
ONLINE_ELECTRIC_PORT="43009"
ONLINE_PG_PORT="43014"
ONLINE_NEON_PROXY_PORT="43015"
ONLINE_REDIS_PORT="43016"
ONLINE_KV_REST_PORT="43017"

PUBLIC_WEB_URL="http://bj1.v.lhb.ink:63000"
PUBLIC_API_URL="http://bj1.v.lhb.ink:63001"
PUBLIC_ELECTRIC_URL="http://bj1.v.lhb.ink:63012"
PUBLIC_RELAY_URL="http://bj1.v.lhb.ink:63013"
PUBLIC_DOMAIN="bj1.v.lhb.ink"

ONLINE_SESSIONS=(
	"superset-online-api"
	"superset-online-web"
	"superset-online-relay"
	"superset-online-electric-proxy"
)

# launchd does not inherit the interactive shell PATH. Keep this list explicit so
# Bun, Docker/OrbStack, and tmux resolve the same way after a Mac restart.
export PATH="$HOME/.bun/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:/Applications/OrbStack.app/Contents/MacOS/xbin:$PATH"

log() {
	printf '[superset-online] %s\n' "$*"
}

fail() {
	printf '[superset-online] ERROR: %s\n' "$*" >&2
	exit 1
}

require_command() {
	command -v "$1" >/dev/null 2>&1 || fail "missing required command: $1"
}

load_base_env() {
	if [[ -f "$BASE_ENV_PATH" ]]; then
		set -a
		# shellcheck source=/dev/null
		source "$BASE_ENV_PATH"
		set +a
	fi
}

apply_online_env() {
	export NODE_ENV="development"
	export SUPERSET_ONLINE_SERVICE="1"
	export SUPERSET_NEXT_DIST_DIR=".next-online"
	export SKIP_ENV_VALIDATION="${SKIP_ENV_VALIDATION:-}"

	export LOCAL_PG_PORT="$ONLINE_PG_PORT"
	export LOCAL_NEON_PROXY_PORT="$ONLINE_NEON_PROXY_PORT"
	export LOCAL_ELECTRIC_PORT="$ONLINE_ELECTRIC_PORT"
	export LOCAL_REDIS_PORT="$ONLINE_REDIS_PORT"
	export LOCAL_KV_REST_PORT="$ONLINE_KV_REST_PORT"

	export DATABASE_URL="postgres://postgres:postgres@db.localtest.me:${ONLINE_NEON_PROXY_PORT}/main"
	export DATABASE_URL_UNPOOLED="postgres://postgres:postgres@localhost:${ONLINE_PG_PORT}/main"

	export KV_REST_API_TOKEN="${KV_REST_API_TOKEN:-local-kv-token}"
	export KV_REST_API_URL="http://localhost:${ONLINE_KV_REST_PORT}"
	export KV_URL="redis://localhost:${ONLINE_REDIS_PORT}"

	export WEB_PORT="$ONLINE_WEB_PORT"
	export API_PORT="$ONLINE_API_PORT"
	export WRANGLER_PORT="$ONLINE_ELECTRIC_PROXY_PORT"
	export RELAY_PORT="$ONLINE_RELAY_PORT"
	export ELECTRIC_PORT="$ONLINE_ELECTRIC_PORT"
	export ELECTRIC_SECRET="${ELECTRIC_SECRET:-local_electric_dev_secret}"
	export ELECTRIC_URL="http://localhost:${ONLINE_ELECTRIC_PORT}/v1/shape"
	export ELECTRIC_SHAPE_URL="http://localhost:${ONLINE_ELECTRIC_PORT}/v1/shape"
	export AUTH_URL="$PUBLIC_API_URL"

	export NEXT_PUBLIC_WEB_URL="$PUBLIC_WEB_URL"
	export NEXT_PUBLIC_API_URL="$PUBLIC_API_URL"
	export NEXT_PUBLIC_ELECTRIC_URL="$PUBLIC_ELECTRIC_URL"
	export NEXT_PUBLIC_ELECTRIC_PROXY_URL="$PUBLIC_ELECTRIC_URL"
	export RELAY_URL="$PUBLIC_RELAY_URL"
	export NEXT_PUBLIC_RELAY_URL="$PUBLIC_RELAY_URL"
	export SUPERSET_WEB_URL="$PUBLIC_WEB_URL"
	export NEXT_PUBLIC_COOKIE_DOMAIN="$PUBLIC_DOMAIN"

	export NEXT_PUBLIC_MARKETING_URL="${NEXT_PUBLIC_MARKETING_URL:-http://localhost:3002}"
	export NEXT_PUBLIC_ADMIN_URL="${NEXT_PUBLIC_ADMIN_URL:-http://localhost:3003}"
	export NEXT_PUBLIC_DOCS_URL="${NEXT_PUBLIC_DOCS_URL:-http://localhost:3004}"
	export NEXT_PUBLIC_DESKTOP_URL="${NEXT_PUBLIC_DESKTOP_URL:-http://localhost:3005}"
	export NEXT_PUBLIC_STREAMS_URL="${NEXT_PUBLIC_STREAMS_URL:-http://localhost:3007}"
	export STREAMS_URL="${STREAMS_URL:-http://localhost:3007}"
}

prepare_env() {
	load_base_env
	apply_online_env
	mkdir -p "$LOG_DIR" "$LAUNCH_SUPPORT_DIR"
	write_electric_proxy_env_file
}

ensure_prereqs() {
	require_command bun
	require_command curl
	require_command docker
	require_command tmux
}

wait_for_docker() {
	local max_attempts="${1:-90}"
	local attempt=1
	while ! docker info >/dev/null 2>&1; do
		if (( attempt >= max_attempts )); then
			fail "Docker/OrbStack is not ready after ${max_attempts} attempts"
		fi
		if (( attempt == 1 )); then
			log "waiting for Docker/OrbStack..."
		fi
		sleep 2
		attempt=$((attempt + 1))
	done
}

compose() {
	COMPOSE_PROJECT_NAME="$COMPOSE_PROJECT_NAME" docker compose \
		-f "$ROOT_DIR/docker-compose.yml" \
		-p "$COMPOSE_PROJECT_NAME" \
		"$@"
}

start_data_services() {
	log "starting isolated Docker data services on 430xx ports"
	wait_for_docker
	if ! compose up -d --build --wait postgres neon-proxy electric redis kv-rest; then
		log "docker compose --wait failed or is unsupported; falling back to detached startup"
		compose up -d --build postgres neon-proxy electric redis kv-rest
	fi
}

run_migrations_and_seed() {
	log "running database migrations against online database"
	bun run --cwd "$ROOT_DIR/packages/db" migrate
	if [[ "${ONLINE_SEED_DEV:-1}" != "0" ]]; then
		log "ensuring development admin account exists"
		bun run --cwd "$ROOT_DIR" db:seed-dev
	fi
}

write_electric_proxy_env_file() {
	mkdir -p "$RUN_DIR"
	cat > "$RUN_DIR/electric-proxy.dev.vars" <<VARS
AUTH_URL=$AUTH_URL
ELECTRIC_SHAPE_URL=$ELECTRIC_SHAPE_URL
ELECTRIC_SECRET=$ELECTRIC_SECRET
ELECTRIC_SOURCE_ID=${ELECTRIC_SOURCE_ID:-}
ELECTRIC_SOURCE_SECRET=${ELECTRIC_SOURCE_SECRET:-}
VARS
}

tmux_session_exists() {
	tmux -S "$TMUX_SOCKET_PATH" has-session -t "$1" >/dev/null 2>&1
}

start_tmux_service() {
	local session="$1"
	local service="$2"

	if tmux_session_exists "$session"; then
		log "tmux session already running: $session"
		return
	fi

	log "starting $service in tmux session $session"
	tmux -S "$TMUX_SOCKET_PATH" new-session -d -s "$session" -c "$RUN_DIR" "exec '$SCRIPT_PATH' run-service '$service'"
}

start_app_services() {
	start_tmux_service "superset-online-api" "api"
	start_tmux_service "superset-online-web" "web"
	start_tmux_service "superset-online-relay" "relay"
	start_tmux_service "superset-online-electric-proxy" "electric-proxy"
}

stop_app_services() {
	local session
	for session in "${ONLINE_SESSIONS[@]}"; do
		if tmux_session_exists "$session"; then
			log "stopping tmux session $session"
			tmux -S "$TMUX_SOCKET_PATH" kill-session -t "$session"
		fi
	done
}

stop_data_services() {
	log "stopping isolated Docker data services"
	wait_for_docker 10
	compose down
}

run_service() {
	local service="${1:-}"
	prepare_env
	local log_file="$LOG_DIR/${service}.log"
	exec > >(tee -a "$log_file") 2>&1
	log "service=$service started at $(date -u '+%Y-%m-%dT%H:%M:%SZ')"

	case "$service" in
		api)
			cd "$ROOT_DIR/apps/api"
			rm -rf "$SUPERSET_NEXT_DIST_DIR"
			exec bun run dev
			;;
		web)
			cd "$ROOT_DIR/apps/web"
			rm -rf "$SUPERSET_NEXT_DIST_DIR"
			exec bun run dev
			;;
		relay)
			cd "$ROOT_DIR/apps/relay"
			exec bun --hot src/index.ts
			;;
		electric-proxy)
			cd "$ROOT_DIR/apps/electric-proxy"
			exec bunx wrangler dev \
				--ip 0.0.0.0 \
				--port "$ONLINE_ELECTRIC_PROXY_PORT" \
				--persist-to "$RUN_DIR/wrangler-state" \
				--env-file "$RUN_DIR/electric-proxy.dev.vars"
			;;
		*)
			fail "unknown service: $service"
			;;
	esac
}

probe_url() {
	local label="$1"
	local url="$2"
	local expected="$3"
	local status
	status="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 8 "$url" 2>/dev/null || true)"
	if [[ "$status" == "$expected" ]]; then
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
		if [[ "$status" == "$expected" ]]; then
			log "$label ready ($status)"
			return
		fi
		if (( attempt >= max_attempts )); then
			fail "$label did not become ready; got ${status:-000}, expected $expected at $url"
		fi
		sleep 2
		attempt=$((attempt + 1))
	done
}

wait_for_local_services() {
	log "waiting for online app services to become ready"
	wait_for_probe "web" "http://localhost:${ONLINE_WEB_PORT}/sign-in" "200"
	wait_for_probe "api" "http://localhost:${ONLINE_API_PORT}/api/auth/get-session" "200"
	wait_for_probe "electric-proxy" "http://localhost:${ONLINE_ELECTRIC_PROXY_PORT}/v1/shape" "401"
	wait_for_probe "relay" "http://localhost:${ONLINE_RELAY_PORT}/health" "200"
}

print_tmux_status() {
	echo "tmux sessions:"
	local session
	for session in "${ONLINE_SESSIONS[@]}"; do
		if tmux_session_exists "$session"; then
			printf '  ✓ %s\n' "$session"
		else
			printf '  ✗ %s\n' "$session"
		fi
	done
}

print_docker_status() {
	echo "docker compose project: $COMPOSE_PROJECT_NAME"
	if docker info >/dev/null 2>&1; then
		compose ps
	else
		echo "  Docker/OrbStack is not reachable"
	fi
}

print_status() {
	prepare_env
	echo "online local ports:"
	echo "  web              http://localhost:${ONLINE_WEB_PORT}"
	echo "  api              http://localhost:${ONLINE_API_PORT}"
	echo "  electric-proxy   http://localhost:${ONLINE_ELECTRIC_PROXY_PORT}"
	echo "  relay            http://localhost:${ONLINE_RELAY_PORT}"
	echo "  postgres         localhost:${ONLINE_PG_PORT}"
	echo "  neon-proxy       localhost:${ONLINE_NEON_PROXY_PORT}"
	echo "  electric         localhost:${ONLINE_ELECTRIC_PORT}"
	echo "  redis            localhost:${ONLINE_REDIS_PORT}"
	echo "  kv-rest          localhost:${ONLINE_KV_REST_PORT}"
	echo
	echo "public router targets to configure:"
	echo "  63000 -> ${ONLINE_WEB_PORT}"
	echo "  63001 -> ${ONLINE_API_PORT}"
	echo "  63012 -> ${ONLINE_ELECTRIC_PROXY_PORT}"
	echo "  63013 -> ${ONLINE_RELAY_PORT}"
	echo
	print_tmux_status
	echo
	print_docker_status
	echo
	echo "local probes:"
	probe_url "web /sign-in" "http://localhost:${ONLINE_WEB_PORT}/sign-in" "200"
	probe_url "api session" "http://localhost:${ONLINE_API_PORT}/api/auth/get-session" "200"
	probe_url "electric auth gate" "http://localhost:${ONLINE_ELECTRIC_PROXY_PORT}/v1/shape" "401"
	probe_url "relay health" "http://localhost:${ONLINE_RELAY_PORT}/health" "200"
	echo
	echo "public probes (these reflect the soft-router mapping):"
	probe_url "public web /sign-in" "${PUBLIC_WEB_URL}/sign-in" "200"
	probe_url "public api session" "${PUBLIC_API_URL}/api/auth/get-session" "200"
	probe_url "public electric" "${PUBLIC_ELECTRIC_URL}/v1/shape" "401"
	probe_url "public relay health" "${PUBLIC_RELAY_URL}/health" "200"
}

write_launch_agent() {
	mkdir -p "$(dirname "$LAUNCH_AGENT_PATH")" "$LAUNCH_SUPPORT_DIR/logs" "$LOG_DIR"
	cp "$SCRIPT_PATH" "$LAUNCH_SCRIPT_PATH"
	chmod +x "$LAUNCH_SCRIPT_PATH"
	if [[ -f "$ROOT_DIR/.env" ]]; then
		cp "$ROOT_DIR/.env" "$LAUNCH_ENV_PATH"
		chmod 600 "$LAUNCH_ENV_PATH"
	fi

	cat > "$LAUNCHER_PATH" <<LAUNCHER
#!/usr/bin/env bash
set -euo pipefail
export PATH="$PATH"
export SUPERSET_ONLINE_ROOT_DIR="$ROOT_DIR"
export SUPERSET_ONLINE_ENV_FILE="$LAUNCH_ENV_PATH"
export SUPERSET_ONLINE_RUN_DIR="$LAUNCH_SUPPORT_DIR/runtime"
exec /bin/bash "$LAUNCH_SCRIPT_PATH" start
LAUNCHER
	chmod +x "$LAUNCHER_PATH"

	cat > "$LAUNCH_AGENT_PATH" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>Label</key>
	<string>${LAUNCH_AGENT_LABEL}</string>
	<key>ProgramArguments</key>
	<array>
		<string>/bin/bash</string>
		<string>${LAUNCHER_PATH}</string>
	</array>
	<key>RunAtLoad</key>
	<true/>
	<key>StandardOutPath</key>
	<string>${LAUNCH_SUPPORT_DIR}/logs/launchd.out.log</string>
	<key>StandardErrorPath</key>
	<string>${LAUNCH_SUPPORT_DIR}/logs/launchd.err.log</string>
</dict>
</plist>
PLIST
}

install_launchd() {
	write_launch_agent
	local domain="gui/$(id -u)"
	launchctl bootout "$domain" "$LAUNCH_AGENT_PATH" >/dev/null 2>&1 || true
	launchctl bootstrap "$domain" "$LAUNCH_AGENT_PATH"
	launchctl enable "$domain/$LAUNCH_AGENT_LABEL" >/dev/null 2>&1 || true
	log "installed LaunchAgent: $LAUNCH_AGENT_PATH"
	launchctl print "$domain/$LAUNCH_AGENT_LABEL" >/dev/null
}

uninstall_launchd() {
	local domain="gui/$(id -u)"
	launchctl bootout "$domain" "$LAUNCH_AGENT_PATH" >/dev/null 2>&1 || true
	rm -f "$LAUNCH_AGENT_PATH"
	rm -f "$LAUNCHER_PATH" "$LAUNCH_SCRIPT_PATH" "$LAUNCH_ENV_PATH"
	log "removed LaunchAgent: $LAUNCH_AGENT_PATH"
}

start_all() {
	prepare_env
	ensure_prereqs
	start_data_services
	run_migrations_and_seed
	start_app_services
	wait_for_local_services
	print_status
}

stop_all() {
	prepare_env
	ensure_prereqs
	stop_app_services
	stop_data_services
}

usage() {
	cat <<USAGE
Usage: $0 <command>

Commands:
  start              Start isolated online Docker data services and app tmux sessions
  stop               Stop only isolated online app sessions and Docker project
  status             Print online service status and probes
  install-launchd    Install and load user LaunchAgent for login startup
  uninstall-launchd  Unload and remove user LaunchAgent
USAGE
}

main() {
	local command="${1:-status}"
	case "$command" in
		start)
			start_all
			;;
		stop)
			stop_all
			;;
		status)
			prepare_env
			ensure_prereqs
			print_status
			;;
		install-launchd)
			prepare_env
			ensure_prereqs
			install_launchd
			;;
		uninstall-launchd)
			prepare_env
			ensure_prereqs
			uninstall_launchd
			;;
		run-service)
			run_service "${2:-}"
			;;
		help|-h|--help)
			usage
			;;
		*)
			usage
			fail "unknown command: $command"
			;;
	esac
}

main "$@"
