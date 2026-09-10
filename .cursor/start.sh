#!/usr/bin/env bash
# Cloud Agent start: per-boot bring-up of the local dev DB stack.
#
# A fresh pod boots from the snapshot with node_modules, .env, Docker images and
# the Postgres volume already on disk, but nothing running. This starts the
# nested Docker daemon, brings the DB stack back up against its persistent
# volume, waits for it to actually serve queries, and applies any migrations
# that landed since the snapshot. Idempotent; returns once the stack is ready.
set -uo pipefail
export PATH="$HOME/.bun/bin:$PATH"
cd "$(git rev-parse --show-toplevel 2>/dev/null || echo /workspace)"

# Nested Docker daemon + networking (see docker-up.sh).
./.cursor/docker-up.sh || exit 1

# .env holds the per-workspace ports + DB URLs written by install. If a pod ever
# boots without it (e.g. install never ran), fall back to the full local setup.
if [ ! -f .env ]; then
  echo "start: .env missing, running full setup.local.sh"
  exec ./.superset/setup.local.sh
fi

set -a
# shellcheck source=/dev/null
. ./.env
set +a

# Match the docker-compose project name setup.local.sh uses (sanitized name).
name="${SUPERSET_WORKSPACE_NAME:-$(basename "$PWD")}"
PROJECT="superset-$(echo "$name" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9._-]/-/g; s/--*/-/g; s/^-//; s/-$//' | cut -c1-48)"

echo "🗄️  Bringing up DB stack ($PROJECT)..."
docker compose -p "$PROJECT" -f docker-compose.yml up -d || exit 1

# Postgres health.
cid="$(docker compose -p "$PROJECT" -f docker-compose.yml ps -q postgres 2>/dev/null)"
for _ in $(seq 1 30); do
  [ "$(docker inspect --format '{{.State.Health.Status}}' "$cid" 2>/dev/null)" = "healthy" ] && break
  sleep 2
done

# neon-http proxy: the app's actual DB path. Probe a real query.
proxy_ready=0
for _ in $(seq 1 30); do
  if curl -s --max-time 3 -X POST "http://localhost:${LOCAL_NEON_PROXY_PORT}/sql" \
      -H "Neon-Connection-String: ${DATABASE_URL}" \
      -H "Content-Type: application/json" \
      -d '{"query":"select 1","params":[]}' 2>/dev/null | grep -q '"command"'; then
    proxy_ready=1; break
  fi
  sleep 1
done
[ "$proxy_ready" = 1 ] || { echo "neon-proxy not ready on :${LOCAL_NEON_PROXY_PORT}" >&2; exit 1; }

# SRH (Redis HTTP shim) used by the relay.
srh_ready=0
for _ in $(seq 1 30); do
  if curl -s --max-time 3 -X POST "http://localhost:${LOCAL_SRH_PORT}/" \
      -H "Content-Type: application/json" \
      -H "Authorization: Bearer local_dev_token" \
      -d '["PING"]' 2>/dev/null | grep -q 'PONG'; then
    srh_ready=1; break
  fi
  sleep 1
done
[ "$srh_ready" = 1 ] || { echo "serverless-redis-http not ready on :${LOCAL_SRH_PORT}" >&2; exit 1; }

# Apply any migrations that landed since the snapshot (idempotent), and ensure
# the dev account exists (idempotent) so "Sign in as dev" always works.
echo "📜 Applying migrations + ensuring dev account..."
bun run db:migrate || exit 1
NODE_ENV=development bun run db:seed-dev || true

echo "✅ Dev DB stack ready ($PROJECT)"
