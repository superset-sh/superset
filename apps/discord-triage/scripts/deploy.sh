#!/usr/bin/env bash
set -euo pipefail

APP=superset-discord-triage

cd "$(git rev-parse --show-toplevel)"

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
