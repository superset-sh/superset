import type { RouterOutputs } from "@superset/trpc";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
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
 * Refetch this PR's detail and the PR list after a state-changing mutation
 * (merge, close, reopen).
 */
export function useInvalidatePullRequestDetail(key: PullRequestDetailKey) {
	const queryClient = useQueryClient();
	const { projectId, hostUrl, prNumber } = key;
	return useCallback(() => {
		void queryClient.invalidateQueries({
			queryKey: pullRequestDetailQueryKey({ projectId, hostUrl, prNumber }),
		});
		void queryClient.invalidateQueries({ queryKey: ["pullRequests"] });
	}, [queryClient, projectId, hostUrl, prNumber]);
}
