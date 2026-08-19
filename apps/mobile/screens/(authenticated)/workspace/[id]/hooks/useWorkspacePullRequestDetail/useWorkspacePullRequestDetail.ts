import { useQuery } from "@tanstack/react-query";
import { useWorkspaceHost } from "@/hooks/useWorkspaceHost";
import {
	getHostServiceClientByUrl,
	hostServiceUrl,
} from "@/lib/host-service/client";
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
	workspaceId: string | null,
	pullNumber: number | null,
) {
	return ["workspace-pull-request", workspaceId, pullNumber] as const;
}

/** Live from the host: the synced rows carry no mergeability, reviewer state or capabilities. */
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
	const { host } = useWorkspaceHost(workspaceId);
	const hostUrl =
		host?.isOnline === true
			? hostServiceUrl(host.organizationId, host.machineId)
			: null;
	const ready =
		hostUrl !== null && owner !== null && repo !== null && pullNumber !== null;

	const query = useQuery({
		queryKey: getPullRequestDetailQueryKey(workspaceId, pullNumber),
		enabled: ready,
		refetchInterval: DETAIL_REFETCH_MS,
		// A sheet mounting a second observer must not trigger a refetch under the card.
		staleTime: DETAIL_REFETCH_MS,
		retry: 1,
		networkMode: "always" as const,
		queryFn: async () => {
			if (!hostUrl || !owner || !repo || pullNumber === null) {
				throw new Error("Host is not resolved");
			}
			const raw = await getHostServiceClientByUrl(
				hostUrl,
			).github.getPullRequestDetail.query({ owner, repo, pullNumber });
			return toDetail(raw);
		},
	});

	return {
		detail: query.data ?? null,
		isLoading: ready && query.isPending,
		isRefetching: query.isRefetching,
		error: query.error,
		refetch: query.refetch,
	};
}

type RawDetail = Awaited<
	ReturnType<
		ReturnType<
			typeof getHostServiceClientByUrl
		>["github"]["getPullRequestDetail"]["query"]
	>
>;

function at(value: string | null): Date | null {
	return value ? new Date(value) : null;
}

function toDetail(raw: RawDetail): PullRequestDetail {
	return {
		pullRequest: {
			...raw.pullRequest,
			state: raw.pullRequest.state as "open" | "closed" | "merged",
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
