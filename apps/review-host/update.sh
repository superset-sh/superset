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

rm -rf /opt/superset.old
mv /opt/superset /opt/superset.old
mv /opt/superset.new /opt/superset

systemctl restart superset-review-host
sleep 10
curl -sf -H "Authorization: Bearer review-host-watchdog" \
  http://127.0.0.1:48800/trpc/host.info || {
    echo "[update] host-service did not come back; rolling back"
    rm -rf /opt/superset
    mv /opt/superset.old /opt/superset
    systemctl restart superset-review-host
    exit 1
  }
rm -rf /opt/superset.old
echo "[update] now on ${SUPERSET_VERSION}"
