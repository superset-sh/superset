#!/usr/bin/env bash
# Local-development teardown. Removes this workspace's DB bundle (Postgres +
# neon-proxy + Electric) and its volume. App servers (web/api/desktop/etc.)
# are stopped by Ctrl+C on `bun dev`; this only tears down the docker stack.
set -uo pipefail

SUPERSET_SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SUPERSET_SCRIPT_DIR/.." && pwd)"

# shellcheck source=/dev/null
source "$SUPERSET_SCRIPT_DIR/lib/common.sh"

cd "$ROOT_DIR" || exit 1

sanitize_name() {
  echo "$1" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9._-]/-/g; s/--*/-/g; s/^-//; s/-$//' | cut -c1-48
}

project="superset-$(sanitize_name "${SUPERSET_WORKSPACE_NAME:-$(basename "$PWD")}")"

echo "🧹 Tearing down local DB stack ($project)..."
if docker compose -p "$project" -f "$ROOT_DIR/docker-compose.yml" down -v; then
  success "Local DB stack removed ($project)"
else
  warn "docker compose down reported an issue — stack may already be gone"
fi
