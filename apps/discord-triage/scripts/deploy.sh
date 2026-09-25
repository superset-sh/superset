#!/usr/bin/env bash
set -euo pipefail

APP=superset-discord-triage

cd "$(git rev-parse --show-toplevel)"

# The bridge DB lives on a volume; create it once in the app's region.
if ! fly volumes list --app "$APP" | grep -q bridge_data; then
  echo "==> creating bridge_data volume"
  fly volumes create bridge_data --app "$APP" --region sjc --size 1 --yes
fi

# --ha=false: gateway bot must be a single machine or every message files duplicate issues
echo "==> fly deploy"
fly deploy \
  --config apps/discord-triage/fly.toml \
  --dockerfile apps/discord-triage/Dockerfile \
  --app "$APP" \
  --ha=false \
  --strategy immediate \
  .

echo "==> Status"
fly status --app "$APP"
