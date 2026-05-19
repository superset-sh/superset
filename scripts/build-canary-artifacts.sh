#!/usr/bin/env bash
set -euo pipefail

COMMIT="${1:-}"
WORKFLOW="release-desktop-canary.yml"
BUILD_REF_ARGS=()
WORKFLOW_BRANCH="$(git symbolic-ref --quiet --short HEAD || true)"
WORKFLOW_SHA="$(git rev-parse HEAD)"
WORKFLOW_REF="$WORKFLOW_BRANCH"

if [ -z "$WORKFLOW_REF" ]; then
  WORKFLOW_REF="$(gh repo view --json defaultBranchRef -q '.defaultBranchRef.name')"
  BUILD_REF_ARGS=(-f build_ref="$WORKFLOW_SHA")
fi

DISPATCH_USER="$(gh api user --jq '.login')"
DISPATCHED_AFTER="$(date -u +'%Y-%m-%dT%H:%M:%SZ')"
RUN_LIST_ARGS=(
  --workflow="$WORKFLOW"
  --event workflow_dispatch
  --user "$DISPATCH_USER"
  --branch "$WORKFLOW_REF"
  --created ">=$DISPATCHED_AFTER"
  --limit=1
  --json url
  -q '.[0].url'
)

if [ -n "$COMMIT" ]; then
  FULL_SHA=$(git rev-parse "$COMMIT")
  BUILD_REF_ARGS=(-f build_ref="$FULL_SHA")
fi

gh workflow run "$WORKFLOW" \
  --ref "$WORKFLOW_REF" \
  -f force_build=true \
  -f publish_release=false \
  "${BUILD_REF_ARGS[@]}"

for _ in {1..15}; do
  RUN_URL="$(gh run list "${RUN_LIST_ARGS[@]}")"
  if [ -n "$RUN_URL" ] && [ "$RUN_URL" != "null" ]; then
    printf '%s\n' "$RUN_URL"
    exit 0
  fi
  sleep 2
done

echo "Timed out waiting for workflow_dispatch run to appear for $WORKFLOW_REF" >&2
exit 1
