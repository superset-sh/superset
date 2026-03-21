#!/bin/bash
# Test script for port-check feature.
# Fakes running services by spawning lightweight HTTP listeners,
# and acts as the "check" command for .superset/ports.json.
#
# Usage:
#   ./test-ports.sh start   — Spawn fake services on ports
#   ./test-ports.sh stop    — Kill all fake services
#   ./test-ports.sh --json  — Output port check JSON (for .superset/ports.json "check" field)
#   ./test-ports.sh status  — Show which fake services are running

PORTS=(9100 9101 9102 9103)
NAMES=("API Server" "Web Client" "Platform" "LLM Proxy")
URLS=("http://localhost:9100/api" "https://local.dev:9101" "http://localhost:9102" "http://localhost:9103")
PID_DIR="/tmp/superset-test-ports"

start_services() {
  mkdir -p "$PID_DIR"
  for i in "${!PORTS[@]}"; do
    port="${PORTS[$i]}"
    name="${NAMES[$i]}"

    if [ -f "$PID_DIR/$port.pid" ] && kill -0 "$(cat "$PID_DIR/$port.pid")" 2>/dev/null; then
      echo "  $name (port $port) — already running (pid $(cat "$PID_DIR/$port.pid"))"
      continue
    fi

    # Spawn a minimal HTTP server that responds with the service name
    bun -e "Bun.serve({ port: $port, fetch: () => new Response('$name running on port $port') })" &
    echo $! > "$PID_DIR/$port.pid"
    echo "  $name (port $port) — started (pid $!)"
  done
  echo ""
  echo "Services started. Use './test-ports.sh --json' as your check command."
  echo "Add to .superset/ports.json:"
  echo '  { "check": "./test-ports.sh --json", "ports": [] }'
}

stop_services() {
  if [ ! -d "$PID_DIR" ]; then
    echo "No services running."
    return
  fi
  for i in "${!PORTS[@]}"; do
    port="${PORTS[$i]}"
    name="${NAMES[$i]}"
    if [ -f "$PID_DIR/$port.pid" ]; then
      pid=$(cat "$PID_DIR/$port.pid")
      if kill -0 "$pid" 2>/dev/null; then
        kill "$pid" 2>/dev/null
        echo "  $name (port $port) — stopped (pid $pid)"
      else
        echo "  $name (port $port) — already stopped"
      fi
      rm -f "$PID_DIR/$port.pid"
    fi
  done
}

print_json() {
  first=true
  echo "["
  for i in "${!PORTS[@]}"; do
    port="${PORTS[$i]}"
    name="${NAMES[$i]}"
    url="${URLS[$i]}"
    pid=""

    if [ -f "$PID_DIR/$port.pid" ]; then
      stored_pid=$(cat "$PID_DIR/$port.pid")
      if kill -0 "$stored_pid" 2>/dev/null; then
        pid="$stored_pid"
      fi
    fi

    # Only include running services
    if [ -z "$pid" ]; then
      continue
    fi

    if [ "$first" = true ]; then
      first=false
    else
      echo ","
    fi
    printf '  {"name": "%s", "port": %d, "url": "%s", "pid": "%s"}' "$name" "$port" "$url" "$pid"
  done
  echo ""
  echo "]"
}

show_status() {
  running=0
  for i in "${!PORTS[@]}"; do
    port="${PORTS[$i]}"
    name="${NAMES[$i]}"
    if [ -f "$PID_DIR/$port.pid" ] && kill -0 "$(cat "$PID_DIR/$port.pid")" 2>/dev/null; then
      echo "  ✓ $name (port $port) — pid $(cat "$PID_DIR/$port.pid")"
      running=$((running + 1))
    else
      echo "  ✗ $name (port $port) — not running"
    fi
  done
  echo ""
  echo "$running/${#PORTS[@]} services running"
}

case "${1:-}" in
  start)
    echo "Starting fake services..."
    start_services
    ;;
  stop)
    echo "Stopping fake services..."
    stop_services
    ;;
  --json)
    print_json
    ;;
  status)
    show_status
    ;;
  *)
    echo "Usage: $0 {start|stop|--json|status}"
    exit 1
    ;;
esac
