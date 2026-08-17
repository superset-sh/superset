#!/bin/bash
# Brings a freshly created sandbox to serving. Everything expensive already
# happened at image build time — the repo is cloned, node_modules installed,
# host.db carries the schema — so this is per-workspace work only and takes a
# second or two.
#
# Started once, fire-and-forget, right after the sandbox is created. It is not
# the image's ENTRYPOINT on purpose: that slot belongs to Blaxel's sandbox-api,
# which serves /process, /fs and the preview routes, and overriding it leaves a
# sandbox nothing can talk to.
set -uo pipefail

WORKSPACE="${SUPERSET_SANDBOX_WORKSPACE_PATH:-/workspace}"
BRANCH="${SUPERSET_SANDBOX_BRANCH:-}"

# The platform injects its own PORT into the sandbox environment, which beats
# the image's ENV. host-service reads PORT, so without this it tries to bind 80
# — reserved here, along with 443 and 8080 — and exits with EADDRINUSE.
export PORT="${SUPERSET_SANDBOX_HOST_PORT:-4879}"

# The schema is baked, so first boot has nothing to migrate. Copied rather than
# used in place because /data is where a persistent volume would mount.
mkdir -p /data
if [ ! -f /data/host.db ] && [ -f /app/host.db.template ]; then
  cp /app/host.db.template /data/host.db
fi

# The baked clone sits on the default branch as of image build. Moving it to the
# requested branch is a one-ref fetch against an object store that is already
# warm, not a clone. The token lives in the environment for the length of the
# fetch and is never written to .git/config.
if [ -n "$BRANCH" ] && [ -d "$WORKSPACE/.git" ]; then
  (
    cd "$WORKSPACE" || exit 0
    if [ -n "${SUPERSET_SANDBOX_GIT_TOKEN:-}" ]; then
      git config --local credential.helper \
        '!f() { echo username=x-access-token; echo "password=${SUPERSET_SANDBOX_GIT_TOKEN}"; }; f'
    fi
    git fetch --depth 1 origin "$BRANCH" >/dev/null 2>&1 &&
      git checkout -q -B "$BRANCH" FETCH_HEAD >/dev/null 2>&1
    git config --local --unset credential.helper >/dev/null 2>&1 || true
  )
fi

cd /app
exec node host-service.js
