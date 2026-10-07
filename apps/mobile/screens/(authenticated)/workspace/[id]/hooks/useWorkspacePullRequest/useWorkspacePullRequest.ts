import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
import { useWorkspaceHost } from "@/hooks/useWorkspaceHost";
import {
	getHostServiceClientByUrl,
	hostServiceUrl,
} from "@/lib/host-service/client";

import { gitlabPullRequestFromUrl } from "@/lib/pull-request-links";

const HISTORY_REFETCH_MS = 60_000;

export interface WorkspacePullRequest {
	/** Stable row key; the host rows have no client-facing id. */
	key: string;
	provider?: "gitlab";
	host?: string;
	expectedUrl?: string;
	repoOwner: string;
	repoName: string;
	prNumber: number;
	url: string;
	title: string;
	state: "open" | "draft" | "merged" | "closed" | "queued";
	isDraft: boolean;
	headBranch: string;
	mergedAt: Date | null;
	linkedAt: number;
	/** The PR on the workspace's current branch — what the sidebar calls linked. */
	isCurrent: boolean;
}

export function getWorkspacePullRequestsQueryKey(workspaceId: string | null) {
	return ["workspace-pull-request-history", workspaceId] as const;
}

/**
 * Every pull request this workspace has ever been linked to, straight from
 * the host's append-only history — current one first, then newest link
 * first. The host is the thing that watches the branch, so this needs no
 * cloud GitHub integration and no branch reconstruction.
 */
export function useWorkspacePullRequests(
	workspaceId: string | null,
): WorkspacePullRequest[] {
	const { host } = useWorkspaceHost(workspaceId);
	const hostUrl =
		host?.isOnline === true
			? hostServiceUrl(host.organizationId, host.machineId)
			: null;

	const query = useQuery({
		queryKey: getWorkspacePullRequestsQueryKey(workspaceId),
		enabled: hostUrl !== null && workspaceId !== null,
		refetchInterval: HISTORY_REFETCH_MS,
		staleTime: 30_000,
		networkMode: "always" as const,
		queryFn: async () => {
			if (!hostUrl || !workspaceId) return { rows: [], hostUrl };
			const result = await getHostServiceClientByUrl(
				hostUrl,
			).pullRequests.historyByWorkspaces.query({
				workspaceIds: [workspaceId],
			});
			return { rows: result.workspaces[0]?.pullRequests ?? [], hostUrl };
		},
	});

	useEffect(() => {
		if (hostUrl && query.data && query.data.hostUrl !== hostUrl)
			void query.refetch();
	}, [hostUrl, query.data, query.refetch]);

	return useMemo(
		() =>
			(query.data?.rows ?? []).flatMap((entry): WorkspacePullRequest[] => {
				const native = gitlabPullRequestFromUrl(entry.url);
				const claimedNative = /\/-\/merge_requests(?:\/|$)/.test(entry.url);
				if (
					claimedNative &&
					(!native ||
						native.owner !== entry.repoOwner ||
						native.repo !== entry.repoName ||
						native.pullNumber !== entry.number ||
						query.data?.hostUrl !== hostUrl)
				)
					return [];
				return [
					{
						key: native
							? `gitlab:${native.expectedUrl}`
							: `${entry.repoOwner}/${entry.repoName}#${entry.number}`,
						repoOwner: entry.repoOwner,
						repoName: entry.repoName,
						prNumber: entry.number,
						url: entry.url,
						title: entry.title,
						state: entry.state,
						isDraft: entry.isDraft,
						headBranch: entry.headBranch,
						mergedAt: entry.mergedAt ? new Date(entry.mergedAt) : null,
						linkedAt: entry.linkedAt,
						isCurrent: entry.isCurrent,
						...(native
							? {
									provider: "gitlab" as const,
									host: native.host,
									expectedUrl: native.expectedUrl,
								}
							: {}),
					},
				];
			}),
		[query.data, hostUrl],
	);
}

/**
 * The currently linked pull request only. Surfaces with room for one PR
 * (Files Changed's share/open actions) must never point at a historical PR
 * from a branch the workspace has moved past.
 */
export function useWorkspacePullRequest(
	workspaceId: string | null,
): WorkspacePullRequest | null {
	return (
		useWorkspacePullRequests(workspaceId).find((entry) => entry.isCurrent) ??
		null
	);
}
