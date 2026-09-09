#!/usr/bin/env bash
# Keeps host-service current, from the box itself.
#
# This is the fix for what actually cost a review cycle: nothing bumped the
# version for 21 days, the app gained seven host procedures in that window, and
# every one 404'd at runtime with no upgrade prompt — 1.22.0 still cleared
# MIN_HOST_SERVICE_VERSION. Manual discipline already failed once here.
#
# Runs on the box rather than from a laptop so it needs no cross-machine
# credentials and keeps working when nobody is looking. update.sh rolls back if
# the new version does not come back up, so the worst case is staying put.
set -euo pipefail

RUNNING=$(curl -sf -m 10 -H "Authorization: Bearer review-host-watchdog" \
  http://127.0.0.1:48800/trpc/host.info 2>/dev/null \
  | python3 -c 'import json,sys;print(json.load(sys.stdin)["result"]["data"]["json"]["version"])' 2>/dev/null || true)
if [ -z "$RUNNING" ]; then
  echo "[self-update] host-service is not answering; leaving it to the watchdog"
  exit 0
fi

# Desktop, host-service and CLI ship one unified version, and the desktop
# release is the one marked latest — the cli-v tag is a prerelease, so
# /releases/latest would never return it.
TAG=$(curl -sf -m 20 -H "Accept: application/vnd.github+json" \
  https://api.github.com/repos/superset-sh/superset/releases/latest 2>/dev/null \
  | python3 -c 'import json,sys;print(json.load(sys.stdin).get("tag_name",""))' 2>/dev/null || true)
LATEST="${TAG#desktop-v}"
case "$LATEST" in
  [0-9]*.[0-9]*.[0-9]*) ;;
  *) echo "[self-update] could not read the latest release (got '${TAG:-nothing}')"; exit 0 ;;
esac

if [ "$RUNNING" = "$LATEST" ]; then
  echo "[self-update] up to date on $RUNNING"
  exit 0
fi

# Only ever move forward. A running version above the latest release means
# someone is testing something; do not quietly downgrade the reviewer's box.
NEWER=$(printf '%s\n%s\n' "$RUNNING" "$LATEST" | sort -V | tail -1)
if [ "$NEWER" = "$RUNNING" ]; then
  echo "[self-update] running $RUNNING is ahead of released $LATEST; leaving it"
  exit 0
fi

echo "[self-update] $RUNNING -> $LATEST"
SUPERSET_VERSION="$LATEST" bash /opt/review-host/update.sh
