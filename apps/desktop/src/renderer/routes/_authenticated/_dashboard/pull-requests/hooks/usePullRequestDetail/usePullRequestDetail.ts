import type { RouterOutputs } from "@superset/trpc";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { assertGitLabHostSupport } from "renderer/lib/host-service-gitlab";
import { fromHostPullRequestContent } from "../../utils/fromHostPullRequestContent";

export type PullRequestDetail =
	RouterOutputs["integration"]["github"]["getPullRequest"] & {
		provider?: "github" | "gitlab";
		instance?: string;
		repoPath?: string;
		headSha?: string | null;
		capabilities?: {
			canMerge: boolean;
			mergeMethods: Array<"merge" | "squash">;
			canClose: boolean;
			canMarkReady: boolean;
			canReply: boolean;
			canResolve: boolean;
		};
	};

interface PullRequestDetailKey {
	projectId: string | null;
	hostUrl: string | null;
	prNumber: number | null;
	provider?: "github" | "gitlab";
	instance?: string;
	repoPath?: string;
}

function pullRequestDetailQueryKey({
	projectId,
	hostUrl,
	prNumber,
	provider = "github",
	instance,
	repoPath,
}: PullRequestDetailKey) {
	return [
		"pull-request-detail",
		projectId,
		hostUrl,
		provider,
		instance,
		repoPath,
		prNumber,
	] as const;
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
	provider = "github",
	instance,
	repoPath,
	enabled = true,
}: PullRequestDetailKey & { enabled?: boolean }) {
	return useQuery({
		queryKey: pullRequestDetailQueryKey({
			projectId,
			hostUrl,
			prNumber,
			provider,
			instance,
			repoPath,
		}),
		queryFn: async () => {
			if (!hostUrl || !projectId || prNumber === null) return null;
			if (provider === "gitlab") await assertGitLabHostSupport(hostUrl);
			const client = getHostServiceClientByUrl(hostUrl);
			const content =
				provider === "gitlab"
					? await client.pullRequests.getContent.query({
							provider: "gitlab",
							projectId,
							prNumber,
							instance: instance ?? "",
							repoPath: repoPath ?? "",
						})
					: await client.pullRequests.getContent.query({ projectId, prNumber });
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
	const { projectId, hostUrl, prNumber, provider, instance, repoPath } = key;
	return useCallback(() => {
		void queryClient.invalidateQueries({
			queryKey: pullRequestDetailQueryKey({
				projectId,
				hostUrl,
				prNumber,
				provider,
				instance,
				repoPath,
			}),
		});
		void queryClient.invalidateQueries({ queryKey: ["pullRequests"] });
	}, [queryClient, projectId, hostUrl, prNumber, provider, instance, repoPath]);
}
