import { useLingui } from "@lingui/react/macro";
import { parseGitRemote } from "@superset/shared/git-remote";
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
import { gitlabPullRequestIdentity } from "./identity";

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
	provider,
	projectId,
	repoUrl,
	expectedUrl,
	isRepoReady = true,
}: {
	workspaceId: string | null;
	owner: string | null;
	repo: string | null;
	pullNumber: number | null;
	provider?: "github" | "gitlab";
	projectId?: string | null;
	repoUrl?: string | null;
	expectedUrl?: string;
	isRepoReady?: boolean;
}) {
	const { t } = useLingui();
	const { host, workspace, isResolving, sandboxWaking, sandboxUnreachable } =
		useWorkspaceHost(workspaceId);
	const hostUrl =
		host?.isOnline === true
			? hostServiceUrl(host.organizationId, host.machineId)
			: null;
	const claimedGitlab =
		provider === "gitlab" ||
		expectedUrl !== undefined ||
		(repoUrl ? parseGitRemote(repoUrl)?.provider === "gitlab" : false);
	const identity =
		claimedGitlab &&
		isRepoReady &&
		provider !== "github" &&
		projectId &&
		workspace?.projectId === projectId
			? gitlabPullRequestIdentity({
					expectedUrl,
					repoUrl,
					owner,
					repo,
					pullNumber,
				})
			: null;
	const ready =
		hostUrl !== null &&
		owner !== null &&
		repo !== null &&
		pullNumber !== null &&
		(!claimedGitlab || identity !== null);

	const query = useQuery({
		queryKey: claimedGitlab
			? [
					...getPullRequestDetailQueryKey(workspaceId, pullNumber),
					"gitlab",
					projectId,
					hostUrl,
					identity?.host,
					owner,
					repo,
					expectedUrl,
				]
			: getPullRequestDetailQueryKey(workspaceId, pullNumber),
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
			if (claimedGitlab) {
				if (!identity || !projectId || !workspaceId)
					throw Error("Host is not resolved");
				const raw = await getHostServiceClientByUrl(
					hostUrl,
				).github.getPullRequestDetail.query({
					owner,
					repo,
					pullNumber,
					provider: "gitlab",
					projectId,
					workspaceId,
					host: identity.host,
					expectedUrl: identity.expectedUrl,
				});
				if (
					!("provider" in raw) ||
					raw.provider !== "gitlab" ||
					raw.host !== identity.host ||
					raw.pullRequest.number !== pullNumber ||
					raw.pullRequest.url !== identity.expectedUrl
				)
					throw Error(t({ message: "Invalid GitLab merge request identity" }));
				return raw;
			}
			const raw = await getHostServiceClientByUrl(
				hostUrl,
			).github.getPullRequestDetail.query({ owner, repo, pullNumber });
			return toDetail(raw);
		},
	});

	const data = query.data;
	const detail: PullRequestDetail | null =
		!claimedGitlab && data && !isGitlabDetail(data) ? data : null;
	const gitlabDetail: GitlabDetail | null =
		claimedGitlab && identity && !query.isError && data && isGitlabDetail(data)
			? data
			: null;
	return {
		detail,
		gitlabDetail,
		// An idle query is not an empty one: while the box is still waking the
		// pull request is unknown, not gone.
		isLoading:
			claimedGitlab && !isRepoReady && !sandboxUnreachable
				? true
				: ready
					? query.isPending
					: (isResolving || sandboxWaking) && !sandboxUnreachable,
		isRefetching: query.isRefetching,
		error:
			claimedGitlab && isRepoReady && !identity
				? new Error(t({ message: "Invalid GitLab merge request identity" }))
				: query.error,
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

type GitlabDetail = Extract<RawDetail, { provider: "gitlab" }>;

function isGitlabDetail(
	value: PullRequestDetail | GitlabDetail,
): value is GitlabDetail {
	return "provider" in value && value.provider === "gitlab";
}

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
