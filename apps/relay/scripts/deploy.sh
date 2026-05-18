#!/usr/bin/env bash
set -euo pipefail

APP=superset-relay
REGIONS=(sjc iad fra nrt sin gru)
COUNT=${#REGIONS[@]}
REGION_LIST=$(IFS=, ; echo "${REGIONS[*]}")

cd "$(git rev-parse --show-toplevel)"

echo "==> fly scale count: $COUNT machines, 1 per region across $REGION_LIST"
fly scale count "app=$COUNT" \
  --region "$REGION_LIST" \
  --max-per-region 1 \
  --app "$APP" \
  --yes

echo "==> fly deploy (rolling)"
fly deploy \
  --config apps/relay/fly.toml \
  --dockerfile apps/relay/Dockerfile \
  --app "$APP" \
  --strategy rolling \
  .

echo "==> Status"
fly status --app "$APP"

echo "==> Smoke test"
"$(dirname "$0")/smoke-test.sh" "${APP}.fly.dev" "${REGIONS[@]}"
