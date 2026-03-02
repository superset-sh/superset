#!/usr/bin/env bash
set -euo pipefail

COMMIT="${1:-}"
REF_FLAG=""
TEMP_BRANCH=""

if [ -n "$COMMIT" ]; then
  FULL_SHA=$(git rev-parse "$COMMIT")
  TEMP_BRANCH="canary-release-${FULL_SHA:0:9}"
  git push origin "$FULL_SHA:refs/heads/$TEMP_BRANCH"
  REF_FLAG="--ref $TEMP_BRANCH"
fi

gh workflow run release-desktop-canary.yml -f force_build=true $REF_FLAG
sleep 2
gh run list --workflow=release-desktop-canary.yml --limit=1 --json url -q '.[0].url'
