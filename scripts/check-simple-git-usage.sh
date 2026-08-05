#!/bin/bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

# Without this, a missing rg exits 127 and the `if` below reads as "no matches",
# so the scan silently passes without having run.
if ! command -v rg >/dev/null 2>&1; then
	echo "[simple-git] ripgrep (rg) is required but not installed" >&2
	exit 1
fi

failures=0

report_violation() {
	local message="$1"
	local pattern="$2"
	shift 2

	local output
	if output=$(rg -n -U --pcre2 "$pattern" apps packages "$@" 2>/dev/null); then
		echo "$message"
		echo "$output"
		echo
		failures=1
	fi
}

COMMON_EXCLUDES=(
	--glob '!**/*.test.ts'
	--glob '!**/*.bench.ts'
	--glob '!**/test/**'
	--glob '!apps/desktop/src/lib/trpc/routers/workspaces/utils/git-client.ts'
	--glob '!packages/host-service/src/runtime/git/simple-git.ts'
)

report_violation \
	"[simple-git] Direct runtime imports from simple-git are forbidden. Use apps/desktop git-client.ts or packages/host-service runtime/git/simple-git.ts." \
	"(?s)import(?!\\s+type\\b)[^;]*from\\s*['\"]simple-git['\"]" \
	"${COMMON_EXCLUDES[@]}"

report_violation \
	"[simple-git] require(\"simple-git\") is forbidden outside tests and approved wrappers." \
	"\\brequire\\(\\s*['\"]simple-git['\"]\\s*\\)" \
	"${COMMON_EXCLUDES[@]}"

report_violation \
	"[simple-git] Direct simpleGit(...) construction is forbidden outside tests and approved wrappers." \
	"\\bsimpleGit\\(" \
	"${COMMON_EXCLUDES[@]}"

if [[ "$failures" -ne 0 ]]; then
	exit 1
fi
