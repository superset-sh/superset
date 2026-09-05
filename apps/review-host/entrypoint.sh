#!/usr/bin/env bash
# Always-on host for the App Store review account.
#
# Launches superset-host directly with the env `superset start` would build
# (see packages/cli/src/lib/host/spawn.ts). Going through the CLI does not work
# headlessly: it polls health for 10s and SIGTERMs the child on timeout, and a
# cold boot on a shared vCPU exceeds that. Auth comes from the OAuth session in
# config.json; SUPERSET_AUTH_CONFIG_PATH lets the service refresh it itself.
#
# Nothing outside /root/.superset survives a restart — the rootfs resets to the
# image every time. Updating host-service by hand on the running machine looks
# like it works and silently reverts on the next boot, so the version in the
# Dockerfile is the only one that exists.
set -uo pipefail

export PATH="/root/superset/bin:${PATH}"

# The reviewer sees this string as the machine name (getHostName() in
# @superset/shared is hostname().split(".")[0]); default is the Fly machine id.
hostname acme-devbox 2>/dev/null || true
CONFIG=/root/.superset/config.json
ORG="${REVIEW_ORG_ID:?}"
RELAY_URL="${RELAY_URL:-https://relay.superset.sh}"
SUPERSET_API_URL="${SUPERSET_API_URL:-https://api.superset.sh}"

HEALTH_SECRET="review-host-watchdog"
ACCESS_TOKEN=$(python3 -c "import json;print(json.load(open('$CONFIG'))['auth']['accessToken'])")
if [ -z "$ACCESS_TOKEN" ]; then
  echo "[review-host] no OAuth access token in $CONFIG — cannot start"
  exec sleep infinity
fi

mkdir -p "/root/.superset/host/$ORG"

# health.check is a tRPC procedure, so it needs the bearer and lives under
# /trpc. Curling a bare /health 404s forever and burns the whole 180s budget
# before seeding runs.
service_up() {
  curl -sf -m 5 -H "Authorization: Bearer $HEALTH_SECRET" \
    "http://127.0.0.1:48800/trpc/health.check" >/dev/null 2>&1
}

# Is the relay actually routing to us? Presence in the Durable Object is the
# same authority host.list reads to decide "online", so this answers the only
# question that matters: does the reviewer's phone see this box?
relay_sees_us() {
  local host_id token
  host_id=$(curl -sf -m 5 -H "Authorization: Bearer $HEALTH_SECRET" \
    "http://127.0.0.1:48800/trpc/host.info" 2>/dev/null \
    | python3 -c 'import json,sys;print(json.load(sys.stdin)["result"]["data"]["json"]["hostId"])' 2>/dev/null)
  # Re-read rather than reuse $ACCESS_TOKEN: host-service rotates the session
  # into config.json, so this doubles as a check that the refresh still works.
  token=$(python3 -c "import json;print(json.load(open('$CONFIG'))['auth']['accessToken'])" 2>/dev/null)
  [ -n "$host_id" ] && [ -n "$token" ] || return 1
  curl -sf -m 10 -H "Authorization: Bearer $token" \
    "$RELAY_URL/presence?hostIds=$ORG:$host_id" 2>/dev/null \
    | python3 -c 'import json,sys;h=json.load(sys.stdin)["hosts"];sys.exit(0 if any(v.get("online") for v in h.values()) else 1)' 2>/dev/null
}

(
  for _ in $(seq 1 90); do
    if service_up; then break; fi
    sleep 2
  done
  echo "[review-host] service answering; registering demo projects"
  if [ ! -f /root/.superset/.demo-seeded ]; then
    env -u SUPERSET_API_KEY superset projects create --local --name acme --import /demo/acme --json || true
    env -u SUPERSET_API_KEY superset projects create --local --name acme-ios --import /demo/acme-ios --json || true
    touch /root/.superset/.demo-seeded
  fi
  env -u SUPERSET_API_KEY superset projects list --local --json || true
) &

# Watchdog: the common failure is not a crash (Fly restarts those) but a live
# process the relay no longer routes to. The reviewer then sees "No projects on
# an online host" while every local signal looks green.
#
# This used to curl /trpc/health.check and trust the HTTP status, which could
# never catch that: the procedure returns 200 unconditionally, and the
# cloudRegistered flag in its body is written once at boot (tunnel/connect.ts)
# and never updated afterwards. Ask the relay instead.
(
  sleep 120
  fails=0
  while true; do
    if relay_sees_us; then
      fails=0
    else
      fails=$((fails + 1))
      echo "[review-host] relay does not see this host ($fails/10)"
      if [ "$fails" -ge 10 ]; then
        echo "[review-host] invisible to the relay for 5m — exiting so Fly restarts"
        kill -TERM 1 2>/dev/null || true
        exit 1
      fi
    fi
    sleep 30
  done
) &

echo "[review-host] exec superset-host (org $ORG)"
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
  HOST_MIGRATIONS_FOLDER=/root/superset/share/migrations \
  superset-host
