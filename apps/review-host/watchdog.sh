#!/usr/bin/env bash
# Liveness for the review host. The failure that strands a reviewer is not a
# crash — systemd restarts those — but a live process the relay no longer routes
# to: the app shows "No projects on an online host" while every local signal is
# green.
#
# Asking host-service is useless for this. /trpc/health.check returns 200
# unconditionally, and the cloudRegistered flag in its body is written once at
# boot (packages/host-service/src/tunnel/connect.ts) and never updated. So ask
# the relay whether it can see us — the same authority host.list reads.
#
# Re-reads the token from config.json each pass, so a broken OAuth refresh trips
# this too rather than silently stranding the box when the session expires.
set -uo pipefail

CONFIG=/root/.superset/config.json
ORG="${REVIEW_ORG_ID:?}"
RELAY_URL="${RELAY_URL:-https://relay.superset.sh}"
HEALTH_SECRET="review-host-watchdog"

relay_sees_us() {
  local host_id token
  host_id=$(curl -sf -m 5 -H "Authorization: Bearer $HEALTH_SECRET" \
    "http://127.0.0.1:48800/trpc/host.info" 2>/dev/null \
    | python3 -c 'import json,sys;print(json.load(sys.stdin)["result"]["data"]["json"]["hostId"])' 2>/dev/null)
  token=$(python3 -c "import json;print(json.load(open('$CONFIG'))['auth']['accessToken'])" 2>/dev/null)
  [ -n "$host_id" ] && [ -n "$token" ] || return 1
  curl -sf -m 10 -H "Authorization: Bearer $token" \
    "$RELAY_URL/presence?hostIds=$ORG:$host_id" 2>/dev/null \
    | python3 -c 'import json,sys;h=json.load(sys.stdin)["hosts"];sys.exit(0 if any(v.get("online") for v in h.values()) else 1)' 2>/dev/null
}

# Presence lags a cold boot by ~20s, so start late and require a sustained
# failure before acting.
sleep 120
fails=0
while true; do
  if relay_sees_us; then
    fails=0
  else
    fails=$((fails + 1))
    echo "[review-host] relay does not see this host ($fails/10)"
    if [ "$fails" -ge 10 ]; then
      echo "[review-host] invisible to the relay for 5m — restarting host-service"
      systemctl restart superset-review-host
      fails=0
      sleep 120
    fi
  fi
  sleep 30
done
