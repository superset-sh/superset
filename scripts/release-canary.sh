#!/usr/bin/env bash
# Dispatch the release-desktop-canary workflow.
#
# Usage:
#   release-canary.sh [<commit>] [--skip-release]
#
#   <commit>         Optional ref/SHA to build; pushed as a temp branch.
#                    Omit to dispatch from the current default branch.
#   --skip-release   Build artifacts only — don't replace the public
#                    desktop-canary GitHub release that teammates' auto-
#                    updater follows. Use for testing a branch build.
set -euo pipefail

COMMIT=""
SKIP_RELEASE_FLAG=""
for arg in "$@"; do
  case "$arg" in
    --skip-release) SKIP_RELEASE_FLAG="-f skip_release=true" ;;
    -* ) echo "unknown flag: $arg" >&2; exit 2 ;;
    *  ) COMMIT="$arg" ;;
  esac
done

REF_FLAG=""
TEMP_BRANCH=""

if [ -n "$COMMIT" ]; then
  FULL_SHA=$(git rev-parse "$COMMIT")
  TEMP_BRANCH="canary-release-${FULL_SHA:0:9}"
  git push origin "$FULL_SHA:refs/heads/$TEMP_BRANCH"
  REF_FLAG="--ref $TEMP_BRANCH"
fi

gh workflow run release-desktop-canary.yml -f force_build=true $SKIP_RELEASE_FLAG $REF_FLAG
sleep 2
gh run list --workflow=release-desktop-canary.yml --limit=1 --json url -q '.[0].url'
