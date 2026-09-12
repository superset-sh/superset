#!/usr/bin/env bash
# Always-on host for the App Store review account, on a persistent VM.
#
# The Fly variant of this lived in an image whose rootfs reset on every restart;
# here /opt/superset and /root/.superset are both on the boot disk, so an
# in-place version bump survives a reboot. update.sh is the supported way to do
# one — keep SUPERSET_VERSION in setup.sh matching whatever it last installed.
set -uo pipefail

export PATH="/opt/superset/bin:/root/.local/bin:${PATH}"

CONFIG=/root/.superset/config.json
ORG="${REVIEW_ORG_ID:?}"
RELAY_URL="${RELAY_URL:-https://relay.superset.sh}"
SUPERSET_API_URL="${SUPERSET_API_URL:-https://api.superset.sh}"
HEALTH_SECRET="review-host-watchdog"

ACCESS_TOKEN=$(python3 -c "import json;print(json.load(open('$CONFIG'))['auth']['accessToken'])")
if [ -z "$ACCESS_TOKEN" ]; then
  echo "[review-host] no OAuth access token in $CONFIG — cannot start"
  exit 1
fi

mkdir -p "/root/.superset/host/$ORG"

exec env -u SUPERSET_API_KEY \
  ORGANIZATION_ID="$ORG" \
  AUTH_TOKEN="$ACCESS_TOKEN" \
  SUPERSET_AUTH_CONFIG_PATH="$CONFIG" \
  SUPERSET_API_URL="$SUPERSET_API_URL" \
  RELAY_URL="$RELAY_URL" \
  PORT=48800 \
  HOST_SERVICE_PORT=48800 \
  HOST_SERVICE_SECRET="$HEALTH_SECRET" \
  HOST_DB_PATH="/root/.superset/host/$ORG/host.db" \
  HOST_MIGRATIONS_FOLDER=/opt/superset/share/migrations \
  superset-host
