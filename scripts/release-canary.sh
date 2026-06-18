#!/usr/bin/env bash
set -euo pipefail

COMMIT="${1:-}"
REF_FLAG=""
TEMP_BRANCH=""
REPO="${GH_REPO:-}"

if [ -z "$REPO" ]; then
  ORIGIN_URL="$(git remote get-url origin)"
  case "$ORIGIN_URL" in
    https://github.com/*)
      REPO="${ORIGIN_URL#https://github.com/}"
      REPO="${REPO%.git}"
      ;;
    git@github.com:*)
      REPO="${ORIGIN_URL#git@github.com:}"
      REPO="${REPO%.git}"
      ;;
    *)
      echo "Unable to infer GitHub repo from origin: $ORIGIN_URL" >&2
      echo "Set GH_REPO=owner/repo and retry." >&2
      exit 1
      ;;
  esac
fi

if [ -n "$COMMIT" ]; then
  FULL_SHA=$(git rev-parse "$COMMIT")
  TEMP_BRANCH="canary-release-${FULL_SHA:0:9}"
  git push origin "$FULL_SHA:refs/heads/$TEMP_BRANCH"
  REF_FLAG="--ref $TEMP_BRANCH"
fi

gh workflow run release-desktop-canary.yml -R "$REPO" -f force_build=true $REF_FLAG
sleep 2
gh run list -R "$REPO" --workflow=release-desktop-canary.yml --limit=1 --json url -q '.[0].url'
