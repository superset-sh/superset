#!/bin/bash
# Wrapper for biome check that fails on ANY diagnostic (info, warn, or error)

output=$(bunx biome check "$@" 2>&1)
exit_code=$?

echo "$output"

# Check if there are any diagnostics (errors, warnings, or infos)
if echo "$output" | grep -qE "Found [0-9]+ (error|info|warning)"; then
  exit 1
fi

exit $exit_code
