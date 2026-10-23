#!/usr/bin/env bash
# Cloud Agent start phase: bring up per-boot runtime state.
#
# 1. Start the Docker daemon (the VM has no init system to do it for us) and
#    adjust the nested-container network so intra-bridge traffic works.
# 2. Run the repo's canonical local setup, which writes the workspace .env,
#    brings up the Postgres + neon-proxy + Redis/SRH stack via docker compose,
#    applies migrations, and seeds the dev account. It is idempotent, so it is
#    safe to run on every boot.
set -uo pipefail

export PATH="$HOME/.bun/bin:$PATH"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

start_dockerd() {
  if sudo docker info >/dev/null 2>&1; then
    echo "==> dockerd already running"
  else
    echo "==> starting dockerd"
    sudo rm -f /var/run/docker.pid
    sudo nohup dockerd >/tmp/dockerd.log 2>&1 &
    local i
    for i in $(seq 1 60); do
      if sudo docker info >/dev/null 2>&1; then
        break
      fi
      sleep 1
    done
    if ! sudo docker info >/dev/null 2>&1; then
      echo "ERROR: dockerd did not become ready within 60s" >&2
      tail -n 40 /tmp/dockerd.log >&2 || true
      return 1
    fi
  fi

  # Let the ubuntu user reach the socket without sudo (setup.local.sh runs
  # `docker compose` directly). The socket is recreated on every daemon start.
  sudo chmod 666 /var/run/docker.sock

  # In this nested VM, routing intra-bridge container traffic through iptables
  # drops it (proxy -> postgres hangs in SYN_SENT). All DB-stack containers
  # share one bridge subnet, so bypassing bridge netfilter lets frames bridge
  # directly at L2. Must be set before `docker compose up` creates the network.
  sudo sysctl -w net.bridge.bridge-nf-call-iptables=0 >/dev/null 2>&1 || true
  sudo sysctl -w net.bridge.bridge-nf-call-ip6tables=0 >/dev/null 2>&1 || true
}

start_dockerd || exit 1

# A stable per-VM name keeps the docker compose project (and its data volume)
# consistent across reboots.
export SUPERSET_WORKSPACE_NAME="${SUPERSET_WORKSPACE_NAME:-cloud-agent}"

echo "==> running .superset/setup.local.sh"
bash ./.superset/setup.local.sh
