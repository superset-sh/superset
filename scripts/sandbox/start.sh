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
REPO_URL="${SUPERSET_SANDBOX_REPO_URL:-}"

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

# The image bakes one repo. When the workspace wants that repo, moving to its
# branch is a one-ref fetch against an object store that is already warm. When
# it wants a different one — any project that isn't the baked one — the baked
# objects are useless and it clones instead, which is what provisioning did for
# every workspace before the repo was baked.
#
# Getting this wrong is silent rather than loud: fetching the requested branch
# from the wrong origin leaves a sandbox serving somebody else's code, so the
# URLs are compared rather than assumed to match.
if [ -n "$REPO_URL" ]; then
  BAKED_URL=$(git -C "$WORKSPACE" remote get-url origin 2>/dev/null || echo "")
  if [ -n "${SUPERSET_SANDBOX_GIT_TOKEN:-}" ]; then
    export GIT_ASKPASS=/app/git-askpass.sh
  fi
  if [ "$BAKED_URL" = "$REPO_URL" ] && [ -d "$WORKSPACE/.git" ]; then
    (
      cd "$WORKSPACE" || exit 0
      git fetch --depth 1 origin "$BRANCH" >/dev/null 2>&1 &&
        git checkout -q -B "$BRANCH" FETCH_HEAD >/dev/null 2>&1
    )
  else
    rm -rf "$WORKSPACE"
    git clone --depth 1 --single-branch --branch "$BRANCH" "$REPO_URL" "$WORKSPACE" \
      >/dev/null 2>&1 ||
      git clone --depth 1 "$REPO_URL" "$WORKSPACE" >/dev/null 2>&1
  fi
  unset GIT_ASKPASS
fi
# The provision-time token exists for that first fetch only. It expires in
# ~1h regardless, but every git operation from here on brokers its own
# credential, so it has no further job — and a token that no longer needs to
# exist is one an agent shouldn't be able to read from this process.
unset SUPERSET_SANDBOX_GIT_TOKEN

# From here on git brokers its credential per operation through host-service
# rather than holding one. Scoped to github.com in the config itself, so git
# never even consults it for another host. Set globally because every git
# invocation in the sandbox — a terminal, an agent, a hook — should get the
# same answer, and none of them should have a token in their environment.
git config --global credential.https://github.com.helper /app/git-credential-helper.sh
git config --global credential.useHttpPath false

# Identity and prompt policy go in the same place, for the same reason: a
# terminal's environment is rebuilt from a snapshot plus an explicit allowlist
# and never inherits this process's env, so an env var set here would reach
# git run from a process.exec but not git run from a Superset terminal — the
# surface people actually use. /root/.gitconfig reaches both.
if [ -n "${GIT_AUTHOR_NAME:-}" ]; then
  git config --global user.name "$GIT_AUTHOR_NAME"
fi
if [ -n "${GIT_AUTHOR_EMAIL:-}" ]; then
  git config --global user.email "$GIT_AUTHOR_EMAIL"
fi


cd /app
exec node host-service.js
