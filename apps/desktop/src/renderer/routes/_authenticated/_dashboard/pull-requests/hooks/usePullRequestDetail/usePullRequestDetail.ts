import type { RouterOutputs } from "@superset/trpc";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { useHostProjects } from "renderer/hooks/host-projects/useHostProjects";
import { useActiveOrganizationId } from "renderer/hooks/useActiveOrganizationId";
import { electronQueryClient } from "renderer/providers/ElectronTRPCProvider/ElectronTRPCProvider";
import { DASHBOARD_SIDEBAR_PULL_REQUEST_QUERY_KEY_PREFIX } from "renderer/routes/_authenticated/_dashboard/components/DashboardSidebar/hooks/useDashboardSidebarData/derivePullRequestQueryTargets";
import { V2_WORKSPACES_PULL_REQUEST_QUERY_KEY_PREFIX } from "renderer/routes/_authenticated/_dashboard/v2-workspaces/hooks/useAccessibleV2Workspaces/useAccessibleV2Workspaces";
import {
	type PullRequestProject,
	resolvePullRequestTarget,
} from "../../utils/resolvePullRequestTarget";
import { fetchPullRequestDetail } from "./utils/fetchPullRequestDetail";

export type PullRequestMergeability = "mergeable" | "conflicting" | "unknown";

export interface PullRequestDetailActor {
	login: string;
	name: string | null;
}

export interface PullRequestDetailComment {
	id: string;
	kind: "comment" | "review";
	author: PullRequestDetailActor | null;
	body: string;
	createdAt: string;
	reviewState: string | null;
	url?: string | null;
}

/** What a host's `gh pr view` adds over the cloud shape. Every field is
 *  optional: the cloud route and hosts older than this read leave them out. */
export interface PullRequestDetailExtras {
	additions?: number;
	deletions?: number;
	changedFiles?: number;
	mergeability?: PullRequestMergeability;
	mergedAt?: string | null;
	closedAt?: string | null;
	reviewers?: PullRequestDetailActor[];
	comments?: PullRequestDetailComment[];
	labels?: { name: string; color: string | null }[];
}

export type PullRequestDetail =
	RouterOutputs["integration"]["github"]["getPullRequest"] &
		PullRequestDetailExtras;

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

export function usePullRequestDetail({
	projectId,
	hostUrl,
	prNumber,
	repoFullName,
	projectQuery,
	enabled = true,
}: PullRequestDetailKey & {
	repoFullName?: string | null;
	projectQuery?: {
		data?: PullRequestProject | null;
		isPending: boolean;
	};
	enabled?: boolean;
}) {
	const organizationId = useActiveOrganizationId();
	const { projects, isReady } = useHostProjects();
	const availableProjects = projectQuery
		? projectQuery.data
			? [projectQuery.data]
			: []
		: projects;
	const projectReady = projectQuery ? !projectQuery.isPending : isReady;
	const target = resolvePullRequestTarget({
		projectId,
		repoFullName,
		projects: availableProjects,
	});

	const isResolvingProject =
		!!projectId &&
		!projectReady &&
		!availableProjects.some(
			(project) => project.id === projectId || project.projectKey === projectId,
		);
	const query = useQuery<PullRequestDetail>({
		queryKey: [
			...pullRequestDetailQueryKey({
				projectId: target.projectId,
				hostUrl,
				prNumber,
			}),
			organizationId,
			target.repoFullName,
		],
		queryFn: () => {
			if (prNumber === null) throw new Error("Invalid pull request number");
			return fetchPullRequestDetail({
				...target,
				hostUrl,
				organizationId,
				prNumber,
			});
		},
		enabled:
			enabled &&
			!isResolvingProject &&
			(!!target.repoFullName || !!target.projectId) &&
			prNumber !== null,
		staleTime: 30_000,
		gcTime: 10 * 60_000,
	});
	return {
		...query,
		...target,
		repoFullName:
			repoFullName ?? query.data?.repoFullName ?? target.repoFullName,
		isResolvingProject,
		isLoading: query.isLoading || isResolvingProject,
	};
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
