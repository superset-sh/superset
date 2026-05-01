#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
turbo_output="$(mktemp "${TMPDIR:-/tmp}/superset-turbo-typecheck.XXXXXX")"
trap 'rm -f "$turbo_output"' EXIT

set +e
turbo typecheck "$@" >"$turbo_output" 2>&1
status=$?
set -e

if [ "$status" -eq 0 ]; then
	cat "$turbo_output"
	exit 0
fi

latest_report="$(find "${TMPDIR:-/tmp}" -maxdepth 1 -name 'report-*.toml' -exec ls -t {} + 2>/dev/null | head -n 1 || true)"

if [ "$status" -eq 101 ] &&
	[ -n "$latest_report" ] &&
	grep -q 'system-configuration' "$latest_report" &&
	grep -q 'Attempted to create a NULL object' "$latest_report"; then
	echo "Turbo crashed while reading macOS system configuration; falling back to direct workspace typechecks."
	exec "$ROOT_DIR/scripts/typecheck-direct.sh"
fi

cat "$turbo_output"
exit "$status"
