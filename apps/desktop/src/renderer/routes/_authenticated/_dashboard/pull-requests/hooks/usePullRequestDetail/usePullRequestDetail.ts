import type { AppRouter as HostServiceAppRouter } from "@superset/host-service";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { inferRouterOutputs } from "@trpc/server";
import { useCallback } from "react";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";

export type PullRequestDetail =
	inferRouterOutputs<HostServiceAppRouter>["pullRequests"]["getContent"];

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
			return client.pullRequests.getContent.query({ projectId, prNumber });
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
