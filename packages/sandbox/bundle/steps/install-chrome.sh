#!/usr/bin/env bash
# Installs the pinned Chrome from the deb sync-assets staged. Re-runs only
# when the chrome row's sha moves, which is a deliberate bump in assets.json.
set -euo pipefail
. /etc/superset/contract.sh
deb="$(ls "${SUPERSET_MEDIA_DIR}"/google-chrome-*.deb | head -1)"
[ -f "$deb" ] || { echo "no Chrome deb under ${SUPERSET_MEDIA_DIR}" >&2; exit 1; }
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq --no-install-recommends "$deb"
rm -rf /var/lib/apt/lists/*
google-chrome-stable --version
