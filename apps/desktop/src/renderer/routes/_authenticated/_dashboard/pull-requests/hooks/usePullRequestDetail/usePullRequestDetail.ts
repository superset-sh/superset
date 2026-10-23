import type {
	PullRequestActivity,
	PullRequestActor,
	PullRequestCommit,
	PullRequestCommitAuthor,
	PullRequestConversationComment,
	PullRequestDetail as PullRequestDetailBase,
	PullRequestMergeability,
} from "@superset/shared/pull-request";
import type { PullRequestDetailRead } from "@superset/shared/pull-request-detail";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { useHostProjects } from "renderer/hooks/host-projects/useHostProjects";
import { useActiveOrganizationId } from "renderer/hooks/useActiveOrganizationId";
import { electronQueryClient } from "renderer/providers/ElectronTRPCProvider/ElectronTRPCProvider";
import { DASHBOARD_SIDEBAR_PULL_REQUEST_QUERY_KEY_PREFIX } from "renderer/routes/_authenticated/_dashboard/components/DashboardSidebar/hooks/useDashboardSidebarData/derivePullRequestQueryTargets";
import { V2_WORKSPACES_PULL_REQUEST_QUERY_KEY_PREFIX } from "renderer/routes/_authenticated/_dashboard/v2-workspaces/hooks/useAccessibleV2Workspaces/useAccessibleV2Workspaces";
import {
	type PullRequestTarget,
	pullRequestThreadsQueryKey,
	readPullRequestDetail,
} from "../../utils/pullRequestClient";
import {
	type PullRequestProject,
	resolvePullRequestTarget,
} from "../../utils/resolvePullRequestTarget";

export type { PullRequestMergeability };
export type PullRequestDetailActor = PullRequestActor;
export type PullRequestDetailComment = PullRequestConversationComment;
export type PullRequestDetailCommitAuthor = PullRequestCommitAuthor;
export type PullRequestDetailCommit = PullRequestCommit;

export type PullRequestDetail = PullRequestDetailBase &
	PullRequestActivity & {
		/** What GitHub lets the viewer do, so nothing is offered that would be refused. */
		capabilities: PullRequestDetailRead["capabilities"];
	};

function pullRequestDetailQueryKey(
	repoFullName: string | null,
	prNumber: number | null,
) {
	return [
		"pull-request-detail",
		repoFullName?.toLowerCase() ?? null,
		prNumber,
	] as const;
}

/**
 * One pull request, read as the viewer. A project is resolved only to name
 * the repository when the link carries none, and for the features that run
 * on a host (agents, workspaces); the read itself never goes through one.
 */
export function usePullRequestDetail({
	projectId,
	prNumber,
	repoFullName,
	projectQuery,
	enabled = true,
}: {
	projectId: string | null;
	prNumber: number | null;
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
			...pullRequestDetailQueryKey(target.repoFullName, prNumber),
			organizationId,
		],
		queryFn: () => {
			if (prNumber === null) throw new Error("Invalid pull request number");
			return readPullRequestDetail({
				organizationId,
				repoFullName: target.repoFullName,
				prNumber,
			});
		},
		enabled:
			enabled &&
			!isResolvingProject &&
			!!target.repoFullName &&
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
 * Refetch this PR's detail and threads, the PR list, and the sidebar and
 * workspace chips after a state-changing mutation. Resolves when the detail
 * refetch has landed, so a mutation that returns this stays pending until
 * the header shows the new state instead of flashing the old one.
 */
export function useInvalidatePullRequestDetail(
	target: PullRequestTarget | null,
) {
	const queryClient = useQueryClient();
	const repoFullName = target?.repoFullName ?? null;
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
		if (prNumber !== null) {
			void queryClient.invalidateQueries({
				queryKey: pullRequestThreadsQueryKey({
					organizationId: null,
					repoFullName,
					prNumber,
				}),
			});
		}
		return queryClient.invalidateQueries({
			queryKey: pullRequestDetailQueryKey(repoFullName, prNumber),
		});
	}, [queryClient, repoFullName, prNumber]);
}
