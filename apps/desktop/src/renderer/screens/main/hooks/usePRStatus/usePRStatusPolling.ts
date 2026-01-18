import { useMemo } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";

const PR_POLLING_INTERVAL_MS = 30_000;
const STALE_TIME_MS = 25_000;

/**
 * Polls GitHub PR status for all open worktree workspaces using a single batch call.
 * Must be non-blocking to avoid degrading sidebar responsiveness.
 */
export function usePRStatusPolling() {
	const { data: groups = [] } =
		electronTrpc.workspaces.getAllGrouped.useQuery();

	// Branch workspaces don't have PRs
	const worktreeWorkspaceIds = useMemo(
		() =>
			groups
				.flatMap((group) => group.workspaces)
				.filter((workspace) => workspace.type === "worktree")
				.map((workspace) => workspace.id),
		[groups],
	);

	// Single batch call instead of N individual calls
	electronTrpc.workspaces.getGitHubStatusBatch.useQuery(
		{ workspaceIds: worktreeWorkspaceIds },
		{
			enabled: worktreeWorkspaceIds.length > 0,
			refetchInterval: PR_POLLING_INTERVAL_MS,
			refetchOnWindowFocus: false,
			refetchOnMount: false,
			refetchOnReconnect: false,
			staleTime: STALE_TIME_MS,
			retry: false,
		},
	);
}
