#!/usr/bin/env bash
# Stand up the App Store review host on a fresh GCP VM, end to end.
#
# Takes over the identity of the existing host rather than creating a second one:
# getHostId() is HMAC(salt, /etc/machine-id) and this host's id is the HMAC of the
# EMPTY string, so setup.sh shows host-service an empty file via BindReadOnlyPaths.
# See README.md. Two machines resolving to one hostId evict each other's relay
# tunnel in a loop, so the old host must be stopped before this one starts.
#
# Needs, from the machine being replaced (or a backup):
#   config.json  — the review account's OAuth session
#   host.db*     — the demo projects and workspaces the reviewer browses
set -euo pipefail

INSTANCE="${INSTANCE:-superset-review-host}"
ZONE="${ZONE:-us-west1-b}"
PROJECT="${PROJECT:-fair-scout-481221-v0}"
MACHINE_TYPE="${MACHINE_TYPE:-e2-standard-4}"
REVIEW_ORG_ID="${REVIEW_ORG_ID:-9617bc8e-7f57-4af8-8b5e-586290ae536a}"
STATE_DIR="${STATE_DIR:?set STATE_DIR to a directory holding config.json and host.db*}"

HERE="$(cd "$(dirname "$0")" && pwd)"
GC=(gcloud --project="$PROJECT")

if ! "${GC[@]}" compute instances describe "$INSTANCE" --zone="$ZONE" >/dev/null 2>&1; then
  echo "==> creating $INSTANCE"
  "${GC[@]}" compute instances create "$INSTANCE" \
    --zone="$ZONE" \
    --machine-type="$MACHINE_TYPE" \
    --image-family=ubuntu-2404-lts-amd64 \
    --image-project=ubuntu-os-cloud \
    --boot-disk-size=50GB \
    --boot-disk-type=pd-balanced \
    --boot-disk-device-name=review-host-boot \
    --deletion-protection \
    --labels=purpose=app-store-review
  # Keep the disk if the instance is ever deleted.
  "${GC[@]}" compute instances set-disk-auto-delete "$INSTANCE" --zone="$ZONE" \
    --no-auto-delete --device-name=review-host-boot
fi

echo "==> staging payload"
PAYLOAD="$(mktemp -d)/payload"
mkdir -p "$PAYLOAD/review-host" "$PAYLOAD/state"
cp "$HERE"/{setup.sh,run.sh,watchdog.sh,update.sh,self-update.sh} "$PAYLOAD/review-host/"
cp -R "$HERE/demo" "$PAYLOAD/demo"
cp "$STATE_DIR/config.json" "$PAYLOAD/state/"
# host.db carries the reviewer's projects and workspaces. Provisioning without
# it produces a host that answers every check and shows an empty app, which is
# worse than failing here.
if ! ls "$STATE_DIR"/host.db >/dev/null 2>&1; then
  echo "no host.db in $STATE_DIR — the reviewer's workspaces live there; refusing to provision an empty host" >&2
  exit 1
fi
cp "$STATE_DIR"/host.db* "$PAYLOAD/state/"
tar -czf "$PAYLOAD.tgz" -C "$(dirname "$PAYLOAD")" payload

echo "==> uploading"
"${GC[@]}" compute scp "$PAYLOAD.tgz" "$INSTANCE:/tmp/payload.tgz" --zone="$ZONE" --quiet
rm -rf "$PAYLOAD" "$PAYLOAD.tgz"

echo "==> provisioning (services enabled, not started)"
"${GC[@]}" compute ssh "$INSTANCE" --zone="$ZONE" --quiet --command="
set -e
cd /tmp && rm -rf payload && tar -xzf payload.tgz
sudo install -d -m0755 /opt/review-host /demo
sudo install -m0755 payload/review-host/*.sh /opt/review-host/
sudo cp -R payload/demo/. /demo/
sudo install -d -m0700 /root/.superset /root/.superset/host/$REVIEW_ORG_ID
sudo install -m0600 payload/state/config.json /root/.superset/config.json
sudo sh -c 'cp /tmp/payload/state/host.db* /root/.superset/host/$REVIEW_ORG_ID/ 2>/dev/null; chmod 600 /root/.superset/host/$REVIEW_ORG_ID/host.db* 2>/dev/null' || true
rm -rf /tmp/payload /tmp/payload.tgz
sudo REVIEW_ORG_ID=$REVIEW_ORG_ID START_SERVICES=0 bash /opt/review-host/setup.sh
"

cat <<NEXT

==> provisioned but NOT serving.

Stop the host being replaced, then:
  gcloud compute ssh $INSTANCE --zone=$ZONE --command 'sudo systemctl start superset-review-host superset-review-watchdog'

Then verify it took over the identity rather than duplicating it:
  gcloud compute ssh $INSTANCE --zone=$ZONE --command \\
    'sudo curl -sf -H "Authorization: Bearer review-host-watchdog" http://127.0.0.1:48800/trpc/host.info'
NEXT
