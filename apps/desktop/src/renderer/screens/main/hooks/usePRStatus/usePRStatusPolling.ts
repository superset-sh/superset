import { electronTrpc } from "renderer/lib/electron-trpc";

const PR_POLLING_INTERVAL_MS = 30_000;
const STALE_TIME_MS = 25_000;

/**
 * Polls GitHub PR status for all open worktree workspaces.
 * Must be non-blocking to avoid degrading sidebar responsiveness.
 */
export function usePRStatusPolling() {
	const { data: groups = [] } =
		electronTrpc.workspaces.getAllGrouped.useQuery();

	// Branch workspaces don't have PRs
	const worktreeWorkspaceIds = groups
		.flatMap((group) => group.workspaces)
		.filter((workspace) => workspace.type === "worktree")
		.map((workspace) => workspace.id);

	electronTrpc.useQueries((t) =>
		worktreeWorkspaceIds.map((workspaceId) =>
			t.workspaces.getGitHubStatus(
				{ workspaceId },
				{
					refetchInterval: PR_POLLING_INTERVAL_MS,
					refetchOnWindowFocus: false,
					refetchOnMount: false,
					refetchOnReconnect: false,
					staleTime: STALE_TIME_MS,
					retry: false,
					placeholderData: (previousData) => previousData,
				},
			),
		),
	);
}
