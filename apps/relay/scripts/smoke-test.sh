#!/usr/bin/env bash
# Post-deploy smoke test for the relay. Hits /health on the public hostname
# with `fly-prefer-region` for every region the fleet is supposed to span,
# then verifies the response 200s with `region` matching the requested
# region — catches partial-deploy failures, missing regions, and machines
# that booted but aren't actually serving.
#
# Usage: smoke-test.sh <hostname> <region> [<region> ...]
#   smoke-test.sh superset-relay-staging.fly.dev sjc iad fra
#
# Exits non-zero on any failure so callers (deploy.sh, deploy-staging.sh)
# can halt the pipeline.
set -euo pipefail

if [ $# -lt 2 ]; then
  echo "usage: $0 <hostname> <region> [<region> ...]" >&2
  exit 64
fi

HOSTNAME="$1"
shift
REGIONS=("$@")

fail=0
for region in "${REGIONS[@]}"; do
  printf "  %-4s " "$region"
  body=$(curl -sS --max-time 8 -H "fly-prefer-region: $region" "https://${HOSTNAME}/health" 2>&1) || {
    printf "  ✗ curl failed: %s\n" "$body"
    fail=$((fail + 1))
    continue
  }
  got=$(printf "%s" "$body" | sed -nE 's/.*"region":"([^"]+)".*/\1/p')
  if [ "$got" = "$region" ]; then
    printf "  ✓ %s\n" "$body"
  else
    printf "  ✗ wanted region=%s, got=%s: %s\n" "$region" "$got" "$body"
    fail=$((fail + 1))
  fi
done

if [ "$fail" -ne 0 ]; then
  echo "==> smoke test FAILED: $fail region(s) did not respond as expected" >&2
  exit 1
fi
echo "==> smoke test OK across ${#REGIONS[@]} region(s)"
