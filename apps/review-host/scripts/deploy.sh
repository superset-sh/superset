#!/usr/bin/env bash
set -euo pipefail

APP=superset-review-host
ROOT="$(git rev-parse --show-toplevel)"

# Never deploy blind: a reviewer may be in the app right now.
echo "==> current host"
fly ssh console --app "$APP" -C \
  "curl -sf -H 'Authorization: Bearer review-host-watchdog' http://127.0.0.1:48800/trpc/host.info" \
  2>/dev/null || echo "(unreachable)"

# host.db migrates forward on boot and does not migrate back.
echo "==> snapshotting the volume"
VOLUME=$(fly volumes list --app "$APP" --json 2>/dev/null | python3 -c 'import json,sys;v=json.load(sys.stdin);print(v[0]["id"] if v else "")')
if [ -n "$VOLUME" ]; then
  fly volumes snapshots create "$VOLUME"
else
  echo "==> no volume yet; creating"
  fly volumes create review_host_data --app "$APP" --region sjc --size 3 --yes
fi

# --ha=false: one host row, one machine. A second machine registers a second
# host and the reviewer gets a picker.
# Absolute paths: fly resolves --config relative to the build context argument.
echo "==> fly deploy"
fly deploy \
  --config "$ROOT/apps/review-host/fly.toml" \
  --dockerfile "$ROOT/apps/review-host/Dockerfile" \
  --app "$APP" \
  --ha=false \
  "$ROOT/apps/review-host"

echo "==> verifying"
fly ssh console --app "$APP" -C \
  "curl -sf -H 'Authorization: Bearer review-host-watchdog' http://127.0.0.1:48800/trpc/host.info"
