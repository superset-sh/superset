#!/bin/bash
# Wrapper for biome check that fails on errors (warnings are allowed)

output=$(bunx biome check "$@" 2>&1)
exit_code=$?

echo "$output"

# Fail only on errors, not warnings
if echo "$output" | grep -qE "Found [0-9]+ error"; then
  exit 1
fi

exit $exit_code
