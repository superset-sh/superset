#!/usr/bin/env bash
# Bump host-service in place. Unlike the Fly image, this persists across reboots.
# Usage (on the VM, as root): SUPERSET_VERSION=1.27.0 bash update.sh
set -euo pipefail
SUPERSET_VERSION="${SUPERSET_VERSION:?set SUPERSET_VERSION}"

rm -rf /opt/superset.new
mkdir -p /opt/superset.new
curl -fsSL -o /tmp/superset.tar.gz \
  "https://github.com/superset-sh/superset/releases/download/cli-v${SUPERSET_VERSION}/superset-linux-x64.tar.gz"
tar -xzf /tmp/superset.tar.gz -C /opt/superset.new
rm -f /tmp/superset.tar.gz
# setup.sh reads this to refuse a downgrade; the bundle carries no version it
# could grep for.
echo "$SUPERSET_VERSION" > /opt/superset.new/.superset-version

rm -rf /opt/superset.old
mv /opt/superset /opt/superset.old
mv /opt/superset.new /opt/superset

# Everything from here can fail, and every failure has to roll back — including
# the restart itself. Under `set -e` a failed `systemctl restart` would exit
# before the health check ran, leaving the new build installed and dead.
roll_back() {
  echo "[update] rolling back to the previous build"
  rm -rf /opt/superset
  mv /opt/superset.old /opt/superset
  systemctl restart superset-review-host || true
  exit 1
}

systemctl restart superset-review-host || roll_back
sleep 10

# -m bounds the whole request: a service that accepts the connection and then
# stops responding would otherwise hang here forever with no rollback.
curl -sf -m 15 -H "Authorization: Bearer review-host-watchdog" \
  http://127.0.0.1:48800/trpc/host.info >/dev/null || {
    echo "[update] host-service did not answer after the restart"
    roll_back
  }

# Answering on loopback is not the same as being reachable. The reviewer's phone
# arrives over the relay, so keep the old build until the relay can see us.
ORG="${REVIEW_ORG_ID:-9617bc8e-7f57-4af8-8b5e-586290ae536a}"
for attempt in $(seq 1 12); do
  HOST_ID=$(curl -sf -m 10 -H "Authorization: Bearer review-host-watchdog" \
    http://127.0.0.1:48800/trpc/host.info 2>/dev/null \
    | python3 -c 'import json,sys;print(json.load(sys.stdin)["result"]["data"]["json"]["hostId"])' 2>/dev/null)
  TOKEN=$(python3 -c 'import json;print(json.load(open("/root/.superset/config.json"))["auth"]["accessToken"])' 2>/dev/null)
  if [ -n "$HOST_ID" ] && [ -n "$TOKEN" ] && curl -sf -m 10 \
      -H "Authorization: Bearer $TOKEN" \
      "https://relay.superset.sh/presence?hostIds=$ORG:$HOST_ID" 2>/dev/null \
      | python3 -c 'import json,sys;h=json.load(sys.stdin)["hosts"];sys.exit(0 if any(v.get("online") for v in h.values()) else 1)' 2>/dev/null; then
    rm -rf /opt/superset.old
    echo "[update] now on ${SUPERSET_VERSION}"
    exit 0
  fi
  sleep 10
done
echo "[update] the relay never saw the new build"
roll_back
