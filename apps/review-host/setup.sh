#!/usr/bin/env bash
# Provisions the App Store review host on a fresh Ubuntu 24.04 VM. Idempotent.
# Run as root on the VM: sudo bash setup.sh
set -euo pipefail

SUPERSET_VERSION="${SUPERSET_VERSION:-1.26.0}"
GH_VERSION="${GH_VERSION:-2.100.0}"
REVIEW_ORG_ID="${REVIEW_ORG_ID:?set REVIEW_ORG_ID}"

# The reviewer sees this as the machine name (getHostName() is
# hostname().split(".")[0]).
hostnamectl set-hostname acme-devbox

export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y --no-install-recommends ca-certificates curl git python3 rsync

# host-service bundle. On the boot disk, so it survives reboots and can be
# updated in place — the whole reason this is a VM and not an immutable image.
# Only ever move forward. self-update.sh bumps this box on its own, so a later
# setup.sh or provision.sh run would otherwise reinstall the pinned default and
# silently downgrade a host the timer had already moved on — the exact staleness
# this directory exists to prevent.
#
# The installed version is recorded in a marker file rather than grepped out of
# the 24 MB bundle: the bundle has no reliable version literal, and a grep that
# matches nothing exits non-zero, which under `set -euo pipefail` aborts setup
# entirely. Both of those bit this script before the marker existed.
INSTALLED=$(cat /opt/superset/.superset-version 2>/dev/null || true)
if [ -n "$INSTALLED" ] && [ "$INSTALLED" != "$SUPERSET_VERSION" ] \
   && [ "$(printf '%s\n%s\n' "$INSTALLED" "$SUPERSET_VERSION" | sort -V | tail -1)" = "$INSTALLED" ]; then
  echo "[setup] leaving host-service $INSTALLED in place; it is newer than $SUPERSET_VERSION"
  SUPERSET_VERSION="$INSTALLED"
fi

if [ ! -x /opt/superset/bin/superset-host ] || [ "$INSTALLED" != "$SUPERSET_VERSION" ]; then
  rm -rf /opt/superset.new
  mkdir -p /opt/superset.new
  curl -fsSL -o /tmp/superset.tar.gz \
    "https://github.com/superset-sh/superset/releases/download/cli-v${SUPERSET_VERSION}/superset-linux-x64.tar.gz"
  tar -xzf /tmp/superset.tar.gz -C /opt/superset.new
  rm -f /tmp/superset.tar.gz
  echo "$SUPERSET_VERSION" > /opt/superset.new/.superset-version
  rm -rf /opt/superset.old
  [ -d /opt/superset ] && mv /opt/superset /opt/superset.old
  mv /opt/superset.new /opt/superset
  rm -rf /opt/superset.old
fi

# The agent the reviewer runs. The installer refuses to run under sudo unless
# told to — without the opt-in it would either abort or land in the invoking
# user's home, and host-service runs as root.
if [ ! -x /root/.local/bin/claude ]; then
  curl -fsSL https://claude.ai/install.sh | CLAUDE_INSTALL_ALLOW_SUDO=1 HOME=/root bash
fi

# Agents reach for gh unprompted; without it they improvise and fail.
if [ ! -x /usr/local/bin/gh ]; then
  curl -fsSL -o /tmp/gh.tar.gz \
    "https://github.com/cli/cli/releases/download/v${GH_VERSION}/gh_${GH_VERSION}_linux_amd64.tar.gz"
  tar -xzf /tmp/gh.tar.gz -C /tmp
  install -m0755 "/tmp/gh_${GH_VERSION}_linux_amd64/bin/gh" /usr/local/bin/gh
  rm -rf /tmp/gh.tar.gz "/tmp/gh_${GH_VERSION}_linux_amd64"
fi

# Demo repositories the reviewer browses.
#
# acme is a CLONE of the public superset-sh/acme-demo, and that matters: its open
# PR #1 is what puts the pull-request chip on a workspace, and the chip is the
# only route to the diff the store listing promises. A `git init` here instead of
# a clone leaves no origin, no refs/remotes/origin/HEAD, and therefore no diff
# base and no PR — which is exactly what happened once.
#
# The guard is on the remote URL, not on .git: a host provisioned by the earlier
# version already has /demo/acme-ios/.git from a `git init`, and a presence check
# would leave that fabricated repo in place forever — no origin, no PR, exactly
# the state this replaced.
mkdir -p /demo
clone_demo() {
  DIR="$1"
  URL="$2"
  if [ "$(git -C "$DIR" remote get-url origin 2>/dev/null)" = "$URL" ]; then
    git -C "$DIR" fetch -q origin
    return
  fi
  rm -rf "$DIR"
  git clone -q "$URL" "$DIR"
}
clone_demo /demo/acme https://github.com/superset-sh/acme-demo.git
clone_demo /demo/acme-ios https://github.com/superset-sh/acme-ios-demo.git
git config --global user.email "appreview@superset.sh"
git config --global user.name "Superset"

install -m0755 /opt/review-host/run.sh /opt/review-host/run.sh 2>/dev/null || true

# Host identity. getHostId() is HMAC(salt, contents of /etc/machine-id), and on
# the Fly image that file was EMPTY — the ubuntu base never populates it and
# nothing there runs systemd — so this host's id is the HMAC of the empty
# string, a5b47dedad57a63d234ffff6753c74df. Reproducing it needs an empty file.
#
# We cannot just blank /etc/machine-id: systemd treats an empty one as first
# boot and repopulates it, which would silently change the id on the next reboot
# and register a second host the reviewer sees as a duplicate. So the OS keeps a
# real machine-id and only host-service is shown an empty one, via BindReadOnlyPaths.
: > /opt/review-host/machine-id
chmod 0444 /opt/review-host/machine-id
[ -s /etc/machine-id ] || systemd-machine-id-setup

cat > /etc/systemd/system/superset-review-host.service <<UNIT
[Unit]
Description=Superset host-service for the App Store review account
After=network-online.target
Wants=network-online.target

[Service]
Type=exec
Environment=REVIEW_ORG_ID=${REVIEW_ORG_ID}
# GH_TOKEN for the host's octokit — ctx.github() throws NO_GITHUB_TOKEN without
# one, so the pull-request chip stays empty even on a public repo. Kept in a
# 0600 file rather than inline: unit files are world-readable. Optional (-) so a
# box without it still boots.
EnvironmentFile=-/etc/superset-review-host.env
ExecStart=/opt/review-host/run.sh
BindReadOnlyPaths=/opt/review-host/machine-id:/etc/machine-id
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
UNIT

cat > /etc/systemd/system/superset-review-watchdog.service <<UNIT
[Unit]
Description=Restarts host-service when the relay stops seeing this host
After=superset-review-host.service
Requires=superset-review-host.service

[Service]
Type=exec
Environment=REVIEW_ORG_ID=${REVIEW_ORG_ID}
ExecStart=/opt/review-host/watchdog.sh
Restart=always
RestartSec=30

[Install]
WantedBy=multi-user.target
UNIT

cat > /etc/systemd/system/superset-review-update.service <<UNIT
[Unit]
Description=Bring the review host up to the latest release (backstop; the release trigger is primary)
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
ExecStart=/opt/review-host/self-update.sh
UNIT

cat > /etc/systemd/system/superset-review-update.timer <<UNIT
[Unit]
Description=Backstop check that the review host is on the current release

[Timer]
# Every 6h. The primary path is the release trigger, which fires the moment a
# release is published; this is what catches a missed or failed webhook, and a
# box that came back from a reboot behind.
OnCalendar=*-*-* 00/6:00:00
RandomizedDelaySec=15m
Persistent=true

[Install]
WantedBy=timers.target
UNIT

systemctl daemon-reload
systemctl enable --now superset-review-update.timer

# Two machines sharing one /etc/machine-id resolve to the same hostId and would
# evict each other's relay tunnel in a loop. START_SERVICES=0 provisions without
# claiming the identity, so the old host can be stopped first.
if [ "${START_SERVICES:-1}" = "1" ]; then
  systemctl enable --now superset-review-host.service
  systemctl enable --now superset-review-watchdog.service
else
  systemctl enable superset-review-host.service
  systemctl enable superset-review-watchdog.service
  echo "[setup] services enabled but not started (START_SERVICES=0)"
fi

echo "[setup] done; host-service ${SUPERSET_VERSION}"
