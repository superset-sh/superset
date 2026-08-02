#!/bin/bash
# Wrapper for biome check that fails on ANY diagnostic (info, warn, or error)

output=$(bunx @biomejs/biome@2.4.2 check "$@" 2>&1)
exit_code=$?

echo "$output"

# Check if there are any diagnostics (errors, warnings, or infos)
if echo "$output" | grep -qE "Found [0-9]+ (error|info|warning)"; then
  exit 1
fi

# Run every guard even after one fails, so a contributor sees all violations
# in a single pass. Don't use `set -e` here: it would abort before the biome
# output above is echoed.
./scripts/check-desktop-git-env.sh || exit_code=1
./scripts/check-git-ref-strings.sh || exit_code=1
./scripts/check-cloud-workspace-usage.sh || exit_code=1
./scripts/check-simple-git-usage.sh || exit_code=1

exit $exit_code
