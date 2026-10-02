import type { RouterOutputs } from "@superset/trpc";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { electronQueryClient } from "renderer/providers/ElectronTRPCProvider/ElectronTRPCProvider";
import { DASHBOARD_SIDEBAR_PULL_REQUEST_QUERY_KEY_PREFIX } from "renderer/routes/_authenticated/_dashboard/components/DashboardSidebar/hooks/useDashboardSidebarData/derivePullRequestQueryTargets";
import { V2_WORKSPACES_PULL_REQUEST_QUERY_KEY_PREFIX } from "renderer/routes/_authenticated/_dashboard/v2-workspaces/hooks/useAccessibleV2Workspaces/useAccessibleV2Workspaces";
import { fromHostPullRequestContent } from "../../utils/fromHostPullRequestContent";

export type PullRequestDetail =
	RouterOutputs["integration"]["github"]["getPullRequest"];

interface PullRequestDetailKey {
	projectId: string | null;
	hostUrl: string | null;
	prNumber: number | null;
}

function pullRequestDetailQueryKey({
	projectId,
	hostUrl,
	prNumber,
}: PullRequestDetailKey) {
	return ["pull-request-detail", projectId, hostUrl, prNumber] as const;
}

/**
 * The PR's GitHub content (title, body, state, checks) for the detail
 * header and summary. Shared by the Pull requests page and the workspace's
 * pull-request pane, so both stay on one cache entry per PR.
 */
export function usePullRequestDetail({
	projectId,
	hostUrl,
	prNumber,
	enabled = true,
}: PullRequestDetailKey & { enabled?: boolean }) {
	return useQuery({
		queryKey: pullRequestDetailQueryKey({ projectId, hostUrl, prNumber }),
		queryFn: async () => {
			if (!hostUrl || !projectId || prNumber === null) return null;
			const client = getHostServiceClientByUrl(hostUrl);
			const content = await client.pullRequests.getContent.query({
				projectId,
				prNumber,
			});
			return fromHostPullRequestContent(content);
		},
		enabled: enabled && !!hostUrl && !!projectId && prNumber !== null,
		staleTime: 30_000,
		gcTime: 10 * 60_000,
	});
}

/**
 * Refetch this PR's detail, the PR list, and the sidebar/workspace chips
 * after a state-changing mutation (merge, close, reopen). Resolves when the
 * detail refetch has landed, so a mutation that returns this stays pending
 * until the header shows the new state instead of flashing the old one.
 */
export function useInvalidatePullRequestDetail(key: PullRequestDetailKey) {
	const queryClient = useQueryClient();
	const { projectId, hostUrl, prNumber } = key;
	return useCallback((): Promise<void> => {
		// Inside a workspace the context client is the workspace's own; the
		// list and chip queries live on the root client and are unreachable
		// from it, so both clients are told.
		for (const client of new Set([queryClient, electronQueryClient])) {
			void client.invalidateQueries({ queryKey: ["pullRequests"] });
			void client.invalidateQueries({
				queryKey: DASHBOARD_SIDEBAR_PULL_REQUEST_QUERY_KEY_PREFIX,
			});
			void client.invalidateQueries({
				queryKey: V2_WORKSPACES_PULL_REQUEST_QUERY_KEY_PREFIX,
			});
		}
		return queryClient.invalidateQueries({
			queryKey: pullRequestDetailQueryKey({ projectId, hostUrl, prNumber }),
		});
	}, [queryClient, projectId, hostUrl, prNumber]);
}
