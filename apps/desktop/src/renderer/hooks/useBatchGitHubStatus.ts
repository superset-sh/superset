import { useEffect } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { BATCH_GITHUB_STATUS_REFETCH_INTERVAL_MS } from "renderer/lib/githubQueryPolicy";

/**
 * Sidebar-level hook that fetches PR status for ALL workspaces in a single
 * GraphQL call, then seeds per-workspace React Query caches so
 * `WorkspaceListItem` reads them instantly without hover gating.
 *
 * Only seeds a cache entry when it is currently empty — never overwrites
 * richer data returned by per-workspace `getGitHubStatus` fetches (which
 * include `previewUrl` and accurate `branchExistsOnRemote`).
 */
export function useBatchGitHubStatus() {
	const utils = electronTrpc.useUtils();

	const { data: batchData } =
		electronTrpc.workspaces.batchGetGitHubStatuses.useQuery(undefined, {
			refetchInterval: BATCH_GITHUB_STATUS_REFETCH_INTERVAL_MS,
			refetchOnWindowFocus: true,
			staleTime: BATCH_GITHUB_STATUS_REFETCH_INTERVAL_MS,
		});

	useEffect(() => {
		if (!batchData) return;

		for (const [workspaceId, status] of Object.entries(batchData)) {
			if (status === null) continue;

			const existing = utils.workspaces.getGitHubStatus.getData({
				workspaceId,
			});

			if (!existing) {
				utils.workspaces.getGitHubStatus.setData({ workspaceId }, status);
			}
		}
	}, [batchData, utils]);
}
