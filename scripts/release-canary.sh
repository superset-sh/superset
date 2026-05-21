#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: bun run release:canary -- [--skip-signing] [commit]

Options:
  --skip-signing        Build unsigned macOS artifacts for manual testing only.
                        Unsigned builds do not update the desktop-canary release feed.
  -h, --help            Show this help message.

Examples:
  bun run release:canary -- HEAD
  bun run release:canary -- --skip-signing HEAD
EOF
}

COMMIT=""
SKIP_SIGNING=false
REF_FLAG=""
TEMP_BRANCH=""

while [ "$#" -gt 0 ]; do
  case "$1" in
    --skip-signing)
      SKIP_SIGNING=true
      ;;
    --skip-signing=true)
      SKIP_SIGNING=true
      ;;
    --skip-signing=false | --no-skip-signing)
      SKIP_SIGNING=false
      ;;
    -h | --help)
      usage
      exit 0
      ;;
    --)
      shift
      if [ "$#" -gt 0 ]; then
        if [ -n "$COMMIT" ]; then
          echo "Error: commit specified more than once" >&2
          usage >&2
          exit 1
        fi
        COMMIT="$1"
        shift
      fi
      if [ "$#" -gt 0 ]; then
        echo "Error: unexpected arguments: $*" >&2
        usage >&2
        exit 1
      fi
      break
      ;;
    -*)
      echo "Error: unknown option: $1" >&2
      usage >&2
      exit 1
      ;;
    *)
      if [ -n "$COMMIT" ]; then
        echo "Error: commit specified more than once: $COMMIT and $1" >&2
        usage >&2
        exit 1
      fi
      COMMIT="$1"
      ;;
  esac
  shift
done

if [ -n "$COMMIT" ]; then
  FULL_SHA=$(git rev-parse "$COMMIT")
  TEMP_BRANCH="canary-release-${FULL_SHA:0:9}"
  git push origin "$FULL_SHA:refs/heads/$TEMP_BRANCH"
  REF_FLAG="--ref $TEMP_BRANCH"
fi

gh workflow run release-desktop-canary.yml -f force_build=true -f skip_signing="$SKIP_SIGNING" $REF_FLAG
sleep 2
gh run list --workflow=release-desktop-canary.yml --limit=1 --json url -q '.[0].url'
