#!/usr/bin/env bash
set -euo pipefail

APP=superset-relay
REGIONS=(sjc)
COUNT=${#REGIONS[@]}
REGION_LIST=$(IFS=, ; echo "${REGIONS[*]}")

cd "$(git rev-parse --show-toplevel)"

echo "==> fly deploy"
fly deploy \
  --config apps/relay/fly.toml \
  --dockerfile apps/relay/Dockerfile \
  --app "$APP" \
  .

echo "==> fly scale count: $COUNT machines, 1 per region across $REGION_LIST"
fly scale count "app=$COUNT" \
  --region "$REGION_LIST" \
  --max-per-region 1 \
  --app "$APP" \
  --yes

echo "==> Status"
fly status --app "$APP"
