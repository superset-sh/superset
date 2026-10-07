#!/usr/bin/env bash
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
exec bun --no-env-file "$root/scripts/client-packaging/client-packaging.ts" desktop "$@"
