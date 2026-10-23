import type { PullRequestDetailRead } from "@superset/shared/pull-request-detail";
import { useQuery } from "@tanstack/react-query";
import { useWorkspaceHost } from "@/hooks/useWorkspaceHost";
import { useSession } from "@/lib/auth/client";
import { apiClient } from "@/lib/trpc/client";
import type {
	MergeableState,
	MergeMethod,
	MergeStateStatus,
	PullRequestCheck,
	PullRequestDetail,
	PullRequestReviewer,
	ReviewDecision,
	ReviewerState,
} from "../../utils/pullRequest";

const DETAIL_REFETCH_MS = 20_000;

export function getPullRequestDetailQueryKey(
	owner: string | null,
	repo: string | null,
	pullNumber: number | null,
) {
	return [
		"pull-request-detail",
		owner?.toLowerCase() ?? null,
		repo?.toLowerCase() ?? null,
		pullNumber,
	] as const;
}

/**
 * Live from GitHub through the API, as the signed-in person: the synced rows
 * carry no mergeability, reviewer state or capabilities, and a host's `gh`
 * would answer as whoever the box is.
 */
export function useWorkspacePullRequestDetail({
	workspaceId,
	owner,
	repo,
	pullNumber,
}: {
	workspaceId: string | null;
	owner: string | null;
	repo: string | null;
	pullNumber: number | null;
}) {
	const { data: session } = useSession();
	const organizationId = session?.session?.activeOrganizationId ?? null;
	// Only a route without its own coordinates still waits on the host's project.
	const { isResolving, sandboxWaking, sandboxUnreachable } =
		useWorkspaceHost(workspaceId);
	const ready =
		organizationId !== null &&
		owner !== null &&
		repo !== null &&
		pullNumber !== null;

	const query = useQuery({
		queryKey: getPullRequestDetailQueryKey(owner, repo, pullNumber),
		enabled: ready,
		refetchInterval: DETAIL_REFETCH_MS,
		// A sheet mounting a second observer must not trigger a refetch under the card.
		staleTime: DETAIL_REFETCH_MS,
		retry: 1,
		networkMode: "always" as const,
		queryFn: async () => {
			if (!organizationId || !owner || !repo || pullNumber === null) {
				throw new Error("Pull request is not resolved");
			}
			const raw = await apiClient.integration.github.getPullRequestDetail.query(
				{
					organizationId,
					repoFullName: `${owner}/${repo}`,
					number: pullNumber,
				},
			);
			return toDetail(raw);
		},
	});

	const resolvingRepo =
		(owner === null || repo === null) &&
		(isResolving || sandboxWaking) &&
		!sandboxUnreachable;
	return {
		detail: query.data ?? null,
		// An idle query is not an empty one: while the session or the repository
		// is still unknown the pull request is unknown, not gone.
		isLoading: ready
			? query.isPending
			: organizationId === null || resolvingRepo,
		isRefetching: query.isRefetching,
		error: query.error,
		refetch: query.refetch,
	};
}

function at(value: string | null): Date | null {
	return value ? new Date(value) : null;
}

function toDetail(raw: PullRequestDetailRead): PullRequestDetail {
	return {
		pullRequest: {
			...raw.pullRequest,
			mergedAt: at(raw.pullRequest.mergedAt),
		},
		checks: raw.checks.map(
			(check): PullRequestCheck => ({
				...check,
				status: check.status as PullRequestCheck["status"],
				conclusion: check.conclusion as PullRequestCheck["conclusion"],
				startedAt: at(check.startedAt),
				completedAt: at(check.completedAt),
			}),
		),
		reviewers: raw.reviewers.map(
			(reviewer): PullRequestReviewer => ({
				...reviewer,
				state: reviewer.state as ReviewerState,
			}),
		),
		mergeability: {
			...raw.mergeability,
			mergeable: raw.mergeability.mergeable as MergeableState,
			mergeStateStatus: raw.mergeability.mergeStateStatus as MergeStateStatus,
			reviewDecision: raw.mergeability.reviewDecision as ReviewDecision,
			queue: raw.mergeability.queue
				? {
						position: raw.mergeability.queue.position,
						state: raw.mergeability.queue.state as NonNullable<
							PullRequestDetail["mergeability"]["queue"]
						>["state"],
					}
				: null,
			allowedMergeMethods: raw.mergeability
				.allowedMergeMethods as MergeMethod[],
		},
		capabilities: raw.capabilities,
	};
}
