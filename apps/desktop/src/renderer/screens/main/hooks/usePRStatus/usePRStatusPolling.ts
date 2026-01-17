import { electronTrpc } from "renderer/lib/electron-trpc";

/** Polling interval for background PR status updates (30 seconds) */
const PR_POLLING_INTERVAL_MS = 30_000;

/** Stale time to prevent unnecessary refetches (25 seconds) */
const STALE_TIME_MS = 25_000;

/**
 * Background hook that polls GitHub PR status for all open worktree workspaces.
 * This enables PR status badges to update automatically across all workspaces,
 * not just the active one.
 *
 * Designed to be completely non-blocking:
 * - Queries run in background with no suspense
 * - Failures are silently ignored (retries disabled)
 * - Initial fetch is deferred to avoid blocking render
 *
 * Should be called once at the app level (e.g., in WorkspaceSidebar).
 */
export function usePRStatusPolling() {
	const { data: groups = [] } =
		electronTrpc.workspaces.getAllGrouped.useQuery();

	// Get all worktree workspace IDs (branch workspaces don't have PRs)
	const worktreeWorkspaceIds = groups
		.flatMap((group) => group.workspaces)
		.filter((workspace) => workspace.type === "worktree")
		.map((workspace) => workspace.id);

	// Poll GitHub status for each worktree workspace (non-blocking)
	electronTrpc.useQueries((t) =>
		worktreeWorkspaceIds.map((workspaceId) =>
			t.workspaces.getGitHubStatus(
				{ workspaceId },
				{
					// Polling configuration
					refetchInterval: PR_POLLING_INTERVAL_MS,
					refetchOnWindowFocus: false,
					refetchOnMount: false,
					refetchOnReconnect: false,

					// Non-blocking configuration
					staleTime: STALE_TIME_MS,
					retry: false, // Don't retry failures - silent fail

					// Use cached data while fetching
					placeholderData: (previousData) => previousData,
				},
			),
		),
	);
}
