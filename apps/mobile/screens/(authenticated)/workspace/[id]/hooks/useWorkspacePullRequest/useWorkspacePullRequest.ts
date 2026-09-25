import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useWorkspaceHost } from "@/hooks/useWorkspaceHost";
import {
	getHostServiceClientByUrl,
	hostServiceUrl,
} from "@/lib/host-service/client";

const HISTORY_REFETCH_MS = 60_000;

export interface WorkspacePullRequest {
	/** Stable row key; the host rows have no client-facing id. */
	key: string;
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
			if (!hostUrl || !workspaceId) return [];
			const result = await getHostServiceClientByUrl(
				hostUrl,
			).pullRequests.historyByWorkspaces.query({
				workspaceIds: [workspaceId],
			});
			return result.workspaces[0]?.pullRequests ?? [];
		},
	});

	return useMemo(
		() =>
			(query.data ?? []).map(
				(entry): WorkspacePullRequest => ({
					key: `${entry.repoOwner}/${entry.repoName}#${entry.number}`,
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
				}),
			),
		[query.data],
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
