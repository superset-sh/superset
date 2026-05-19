#!/usr/bin/env bash
set -euo pipefail

COMMIT="${1:-}"
WORKFLOW="release-desktop-canary.yml"
TEMP_BRANCH=""
REF_ARGS=()

if [ -n "$COMMIT" ]; then
  FULL_SHA=$(git rev-parse "$COMMIT")
  TEMP_BRANCH="canary-artifact-build-${FULL_SHA:0:9}"
  git push origin "$FULL_SHA:refs/heads/$TEMP_BRANCH"
  REF_ARGS=(--ref "$TEMP_BRANCH")
fi

gh workflow run "$WORKFLOW" -f force_build=true -f publish_release=false "${REF_ARGS[@]}"
sleep 2
gh run list --workflow="$WORKFLOW" --limit=1 --json url -q '.[0].url'
