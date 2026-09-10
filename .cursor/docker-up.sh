#!/usr/bin/env bash
# Bring up a nested Docker daemon for the local dev DB stack.
#
# Cloud Agent VMs have no init system, so dockerd must be started by hand, and
# the nested-container sandbox needs two tweaks the docker-compose stack in
# ../docker-compose.yml relies on. Idempotent: safe to run on every boot.
set -uo pipefail

# 1) Daemon: start only if it isn't already serving.
if ! docker info >/dev/null 2>&1; then
  sudo mkdir -p /etc/docker
  # The VM root is an overlay/tmpfs, so the default overlay2 storage driver is
  # unavailable; fuse-overlayfs is the driver that works in the sandbox.
  if [ ! -f /etc/docker/daemon.json ]; then
    echo '{"storage-driver":"fuse-overlayfs"}' | sudo tee /etc/docker/daemon.json >/dev/null
  fi
  sudo sh -c 'nohup dockerd >/var/log/dockerd.log 2>&1 &'
  for _ in $(seq 1 30); do
    docker info >/dev/null 2>&1 && break
    sleep 1
  done
fi

# 2) Let this (non-root) user reach the daemon without sudo.
sudo chmod 666 /var/run/docker.sock 2>/dev/null || true

# 3) Nested-Docker networking: same-subnet container<->container traffic on the
# compose bridge is dropped when bridged frames traverse iptables (the sandbox's
# nft/legacy split has no ACCEPT rule for it), which makes neon-proxy->postgres
# and srh->redis time out. Turning bridge-nf off lets intra-bridge L2 traffic
# flow. This is kernel runtime state, so it is reapplied on every boot.
sudo modprobe br_netfilter 2>/dev/null || true
sudo sysctl -w net.bridge.bridge-nf-call-iptables=0 >/dev/null 2>&1 || true
sudo sysctl -w net.bridge.bridge-nf-call-ip6tables=0 >/dev/null 2>&1 || true

if ! docker info >/dev/null 2>&1; then
  echo "docker daemon failed to start (see /var/log/dockerd.log)" >&2
  exit 1
fi
echo "docker daemon ready"
