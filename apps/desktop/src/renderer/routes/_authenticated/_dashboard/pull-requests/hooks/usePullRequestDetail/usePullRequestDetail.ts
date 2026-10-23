import type {
	PullRequestActivity,
	PullRequestActor,
	PullRequestCommit,
	PullRequestCommitAuthor,
	PullRequestConversationComment,
	PullRequestDetail as PullRequestDetailBase,
	PullRequestMergeability,
} from "@superset/shared/pull-request";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { useHostProjects } from "renderer/hooks/host-projects/useHostProjects";
import { useActiveOrganizationId } from "renderer/hooks/useActiveOrganizationId";
import { electronQueryClient } from "renderer/providers/ElectronTRPCProvider/ElectronTRPCProvider";
import { DASHBOARD_SIDEBAR_PULL_REQUEST_QUERY_KEY_PREFIX } from "renderer/routes/_authenticated/_dashboard/components/DashboardSidebar/hooks/useDashboardSidebarData/derivePullRequestQueryTargets";
import { V2_WORKSPACES_PULL_REQUEST_QUERY_KEY_PREFIX } from "renderer/routes/_authenticated/_dashboard/v2-workspaces/hooks/useAccessibleV2Workspaces/useAccessibleV2Workspaces";
import type { PullRequestTarget } from "../../utils/pullRequestClient";
import {
	type PullRequestProject,
	resolvePullRequestTarget,
} from "../../utils/resolvePullRequestTarget";
import { fetchPullRequestDetail } from "./utils/fetchPullRequestDetail";

export type { PullRequestMergeability };
export type PullRequestDetailActor = PullRequestActor;
export type PullRequestDetailComment = PullRequestConversationComment;
export type PullRequestDetailCommitAuthor = PullRequestCommitAuthor;
export type PullRequestDetailCommit = PullRequestCommit;

/** What a full read adds over the detail. Every field is optional: a host
 *  older than the extended `gh pr view` read leaves them out. */
export type PullRequestDetailExtras = Partial<PullRequestActivity>;

export type PullRequestDetail = PullRequestDetailBase & PullRequestDetailExtras;

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
export function useInvalidatePullRequestDetail(
	target: PullRequestTarget | null,
) {
	const queryClient = useQueryClient();
	const projectId = target?.host?.projectId ?? null;
	const hostUrl = target?.host?.hostUrl ?? null;
	const prNumber = target?.prNumber ?? null;
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
		// The workspace pane's review threads live on the context client under
		// tRPC's own key; a thread reply posted here must reach them too.
		void queryClient.invalidateQueries({
			queryKey: [["git", "getPullRequestThreads"]],
		});
		return queryClient.invalidateQueries({
			queryKey: pullRequestDetailQueryKey({ projectId, hostUrl, prNumber }),
		});
	}, [queryClient, projectId, hostUrl, prNumber]);
}
