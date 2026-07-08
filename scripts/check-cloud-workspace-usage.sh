#!/bin/bash
# Forbids cloud `v2Workspace.*` calls in the external client packages that have
# migrated to host fan-out. Workspace records are host-owned (see
# plans/offline-first-workspace-table-reference.md); the CLI and SDK resolve the
# owning host and call its `workspace.list`/`.update`/`.delete` over the relay,
# never the cloud router directly — otherwise host-backed reads go stale (P1).
#
# packages/mcp-v2 is DELIBERATELY EXCLUDED for now: the MCP server ships inside
# apps/api and deploys with the cloud, weeks before desktops ship `workspace.list`.
# If it fanned out during that window it would hit only old hosts and return
# empty (`workspaces_list` alone is ~30 users/wk — see PostHog `mcp_tool_called`).
# So MCP stays cloud-backed until desktop adoption; re-add it here in the
# follow-up that flips MCP to fan-out. packages/trpc (the router) and
# packages/host-service (the R1/R2 dual-write) legitimately use it; apps/web and
# apps/desktop are handled by their own migration state. R3 deletes this guard.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

failures=0

output=$(rg -n "\\bv2Workspace\\.(create|update|delete|list|getFromHost|setTask|updateNameFromHost|deleteMainForHost)\\b" \
	--type ts \
	packages/cli/src packages/sdk/src \
	2>/tmp/rg_cloud_ws.$$) && rc=0 || rc=$?
rg_err=$(cat /tmp/rg_cloud_ws.$$ 2>/dev/null || true)
rm -f /tmp/rg_cloud_ws.$$

case "$rc" in
	0)
		echo "[cloud-workspace] Direct cloud v2Workspace.* calls are forbidden in the CLI/SDK client packages."
		echo "[cloud-workspace] Workspace records are host-owned — resolve the owning host and call its workspace.* over the relay."
		echo "$output"
		echo
		failures=1
		;;
	1)
		: # no matches, pass
		;;
	*)
		echo "[cloud-workspace] ripgrep failed (exit $rc): $rg_err" >&2
		exit "$rc"
		;;
esac

if [[ "$failures" -ne 0 ]]; then
	exit 1
fi
