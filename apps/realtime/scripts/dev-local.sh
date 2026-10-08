#!/usr/bin/env bash
# wrangler dev exits when a client aborts a request, which every app relaunch does.
set -uo pipefail

REALTIME_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ROOT_DIR="$(cd "$REALTIME_DIR/../.." && pwd)"

[ -f "$ROOT_DIR/.env" ] || { echo "dev:realtime: no .env; run setup first"; exit 1; }
set -a
# shellcheck source=/dev/null
. "$ROOT_DIR/.env"
set +a
: "${REALTIME_PORT:?REALTIME_PORT is not set in .env}"
: "${NEXT_PUBLIC_API_URL:?NEXT_PUBLIC_API_URL is not set in .env}"
: "${REALTIME_NUDGE_SECRET:?REALTIME_NUDGE_SECRET is not set in .env}"

trap 'exit 0' INT TERM
cd "$REALTIME_DIR"
while true; do
  CI=1 WRANGLER_SEND_METRICS=false node_modules/.bin/wrangler dev --local \
    --port "$REALTIME_PORT" \
    --var "NEXT_PUBLIC_API_URL:$NEXT_PUBLIC_API_URL" \
    --var "NUDGE_SECRET:$REALTIME_NUDGE_SECRET" \
    --var "USERCONTENT_URL:${USERCONTENT_URL:-https://frame.supersetusercontent.com}"
  sleep 1
done
