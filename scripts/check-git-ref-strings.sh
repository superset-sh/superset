#!/bin/bash
# Forbids string-prefix checks against `origin/...` shortnames anywhere
# outside the git-refs module. See packages/host-service/GIT_REFS.md.
#
# Why this exists: a local branch can legitimately be named `origin/foo`,
# so `ref.startsWith("origin/")` misclassifies it as remote-tracking.
# The fix is to use the discriminated `ResolvedRef` from
# packages/host-service/src/runtime/git/refs.ts instead of inferring kind
# from a refname string.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

failures=0

report_violation() {
	local message="$1"
	local pattern="$2"
	shift 2

	# Don't swallow ripgrep errors — distinguish:
	#   exit 0: matches found → report as violations
	#   exit 1: no matches → silent pass
	#   exit 2: actual rg error (unreadable file, bad regex, etc.) → fail loudly
	local output
	local rg_err
	output=$(rg -n -U --pcre2 "$pattern" "$@" 2>/tmp/rg_stderr.$$) && rc=0 || rc=$?
	rg_err=$(cat /tmp/rg_stderr.$$ 2>/dev/null || true)
	rm -f /tmp/rg_stderr.$$
	case "$rc" in
		0)
			echo "$message"
			echo "$output"
			echo
			failures=1
			;;
		1)
			: # no matches, pass
			;;
		*)
			echo "[git-refs] ripgrep scan failed (exit $rc)" >&2
			[[ -n "$rg_err" ]] && echo "$rg_err" >&2
			failures=1
			;;
	esac
}

# V1 desktop tRPC routers (apps/desktop/src/lib/trpc/routers/**) are out of
# scope for this rule — see GIT_REFS.md "Open questions" for the v1 cleanup
# follow-up. Once those routers migrate to ResolvedRef, drop the exclusions.
V1_EXCLUDE='!apps/desktop/src/lib/trpc/routers/**'

report_violation \
	"[git-refs] '.startsWith(\"origin/\")' is forbidden — a local branch can be named 'origin/foo' and would be misclassified. Use ResolvedRef from @superset/host-service/git." \
	"\\.startsWith\\(\\s*['\"]origin/" \
	--type ts \
	--glob '!**/*.test.ts' \
	--glob '!packages/host-service/src/runtime/git/refs.ts' \
	--glob "$V1_EXCLUDE"

report_violation \
	"[git-refs] '.replace(\"origin/\", ...)' is forbidden — same misclassification risk. Use ResolvedRef.shortName / .remote instead." \
	"\\.replace\\(\\s*['\"]origin/" \
	--type ts \
	--glob '!**/*.test.ts' \
	--glob '!packages/host-service/src/runtime/git/refs.ts' \
	--glob "$V1_EXCLUDE"

if [[ "$failures" -ne 0 ]]; then
	exit 1
fi
