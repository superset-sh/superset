import { isMissingProcedureError } from "@superset/shared/missing-procedure-error";
import type { PullRequestDiff } from "@superset/shared/pull-request-diff";
import type { PullRequestReviewThread } from "@superset/shared/pull-request-threads";
import { cloudTrpcClient } from "renderer/lib/cloud-trpc";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import type { PullRequestDetail } from "../../hooks/usePullRequestDetail";
import { combinePullRequestErrors } from "../combinePullRequestReadErrors";
import { fromCloudPullRequest } from "../fromCloudPullRequest";
import { fromHostPullRequestContent } from "../fromHostPullRequestContent";

/** A host with the repository checked out, for `gh` when the cloud cannot act. */
export interface PullRequestHostTarget {
	hostUrl: string;
	projectId: string | null;
}

/**
 * A pull request by its own identity. The cloud reads and writes it as the
 * signed-in person whenever the repository and organization are known; the
 * host is only the fallback, since its `gh` acts as whoever the box is.
 */
export interface PullRequestTarget {
	organizationId: string | null;
	repoFullName: string | null;
	prNumber: number;
	host: PullRequestHostTarget | null;
}

export interface PullRequestThreads {
	reviewThreads: PullRequestReviewThread[];
	fetchFailed: boolean;
}

export type PullRequestMergeMethod = "merge" | "squash" | "rebase";

type CloudGateway = typeof cloudTrpcClient.integration.github;
type HostGateway = ReturnType<typeof getHostServiceClientByUrl>["pullRequests"];

export interface PullRequestGateways {
	cloud: () => CloudGateway;
	host: (hostUrl: string) => HostGateway;
}

const gateways: PullRequestGateways = {
	cloud: () => cloudTrpcClient.integration.github,
	host: (hostUrl) => getHostServiceClientByUrl(hostUrl).pullRequests,
};

function trpcErrorCode(error: unknown): string | undefined {
	const data = (error as { data?: { code?: unknown } } | null | undefined)
		?.data;
	return typeof data?.code === "string" ? data.code : undefined;
}

/**
 * The cloud never reached GitHub: an API without the procedure yet, or a
 * viewer with neither a GitHub connection nor an App installation. Anything
 * GitHub itself answered is final — retrying it through the host would act
 * as someone else.
 */
export function cloudCannotAct(error: unknown): boolean {
	return (
		isMissingProcedureError(error) ||
		trpcErrorCode(error) === "PRECONDITION_FAILED"
	);
}

export function reachesCloud(target: PullRequestTarget): boolean {
	return Boolean(target.organizationId && target.repoFullName);
}

export function canActOnPullRequest(target: PullRequestTarget): boolean {
	return reachesCloud(target) || Boolean(target.host?.projectId);
}

export function pullRequestThreadsQueryKey(target: PullRequestTarget) {
	return [
		"pull-request-threads",
		target.repoFullName?.toLowerCase() ?? target.host?.projectId ?? null,
		target.prNumber,
	] as const;
}

function cloudInput(target: PullRequestTarget) {
	if (!target.organizationId || !target.repoFullName) {
		throw new Error("The pull request's repository is unknown");
	}
	return {
		organizationId: target.organizationId,
		repoFullName: target.repoFullName,
		number: target.prNumber,
	};
}

type Attempt<T> = (() => Promise<T>) | null | false | undefined | "";

async function firstAnswer<T>(
	attempts: Attempt<T>[],
	none: string,
): Promise<T> {
	const errors: unknown[] = [];
	for (const attempt of attempts) {
		if (!attempt) continue;
		try {
			return await attempt();
		} catch (error) {
			errors.push(error);
		}
	}
	if (errors.length === 0) throw new Error(none);
	throw combinePullRequestErrors(errors);
}

export function readPullRequestContent(
	target: PullRequestTarget,
	deps: PullRequestGateways = gateways,
): Promise<PullRequestDetail> {
	const { host, prNumber, repoFullName } = target;
	const projectId = host?.projectId ?? null;
	return firstAnswer<PullRequestDetail>(
		[
			reachesCloud(target) &&
				(() => {
					const input = cloudInput(target);
					return deps
						.cloud()
						.getPullRequestDetail.query({ ...input, activity: true })
						.then((read) => fromCloudPullRequest(read, input.repoFullName));
				}),
			host &&
				projectId &&
				(() =>
					deps
						.host(host.hostUrl)
						.getContent.query({ projectId, prNumber })
						.then(fromHostPullRequestContent)),
			host &&
				repoFullName &&
				(() =>
					deps
						.host(host.hostUrl)
						.getContentByRepo.query({ repoFullName, prNumber })
						.then(fromHostPullRequestContent)),
		],
		"No GitHub repository available to fetch the pull request",
	);
}

export function readPullRequestThreads(
	target: PullRequestTarget,
	deps: PullRequestGateways = gateways,
): Promise<PullRequestThreads> {
	const { host, prNumber } = target;
	const projectId = host?.projectId ?? null;
	return firstAnswer<PullRequestThreads>(
		[
			reachesCloud(target) &&
				(() => deps.cloud().getPullRequestThreads.query(cloudInput(target))),
			host &&
				projectId &&
				(() =>
					deps.host(host.hostUrl).getThreads.query({ projectId, prNumber })),
		],
		"No GitHub repository available to fetch review threads",
	);
}

export function readPullRequestDiff(
	target: PullRequestTarget,
	deps: PullRequestGateways = gateways,
): Promise<PullRequestDiff> {
	const { host, prNumber, repoFullName } = target;
	const projectId = host?.projectId ?? null;
	return firstAnswer<PullRequestDiff>(
		[
			reachesCloud(target) &&
				(() => deps.cloud().getPullRequestDiff.query(cloudInput(target))),
			host &&
				projectId &&
				(() => deps.host(host.hostUrl).getDiff.query({ projectId, prNumber })),
			host &&
				repoFullName &&
				(() =>
					deps
						.host(host.hostUrl)
						.getDiffByRepo.query({ repoFullName, prNumber })),
		],
		"No GitHub repository available to fetch the diff",
	);
}

async function act(
	target: PullRequestTarget,
	deps: PullRequestGateways,
	cloud: (github: CloudGateway) => Promise<unknown>,
	host: ((pullRequests: HostGateway) => Promise<unknown>) | null,
): Promise<void> {
	const hostUrl = target.host?.hostUrl;
	const viaHost = host && hostUrl ? () => host(deps.host(hostUrl)) : null;
	if (reachesCloud(target)) {
		try {
			await cloud(deps.cloud());
			return;
		} catch (error) {
			if (!viaHost || !cloudCannotAct(error)) throw error;
		}
	}
	if (!viaHost) throw new Error("No GitHub access for this pull request");
	await viaHost();
}

export function addPullRequestComment(
	target: PullRequestTarget,
	body: string,
	deps: PullRequestGateways = gateways,
): Promise<void> {
	const { prNumber } = target;
	const projectId = target.host?.projectId;
	return act(
		target,
		deps,
		(github) =>
			github.addPullRequestComment.mutate({ ...cloudInput(target), body }),
		projectId
			? (pullRequests) =>
					pullRequests.addComment.mutate({ projectId, prNumber, body })
			: null,
	);
}

export function replyToPullRequestThread(
	target: PullRequestTarget,
	reply: { commentId: number; body: string },
	deps: PullRequestGateways = gateways,
): Promise<void> {
	const { prNumber } = target;
	const projectId = target.host?.projectId;
	return act(
		target,
		deps,
		(github) =>
			github.replyToPullRequestThread.mutate({
				...cloudInput(target),
				...reply,
			}),
		projectId
			? (pullRequests) =>
					pullRequests.replyToThread.mutate({ projectId, prNumber, ...reply })
			: null,
	);
}

export function setPullRequestThreadResolution(
	target: PullRequestTarget,
	thread: { threadId: string; resolved: boolean },
	deps: PullRequestGateways = gateways,
): Promise<void> {
	return act(
		target,
		deps,
		(github) =>
			github.setPullRequestThreadResolution.mutate({
				...cloudInput(target),
				...thread,
			}),
		(pullRequests) => pullRequests.setThreadResolution.mutate(thread),
	);
}

export function mergePullRequest(
	target: PullRequestTarget,
	merge: { mergeMethod: PullRequestMergeMethod; commitMessage?: string },
	deps: PullRequestGateways = gateways,
): Promise<void> {
	const { prNumber } = target;
	const projectId = target.host?.projectId;
	return act(
		target,
		deps,
		(github) =>
			github.mergePullRequest.mutate({ ...cloudInput(target), ...merge }),
		projectId
			? (pullRequests) =>
					pullRequests.mergePR.mutate({ projectId, prNumber, ...merge })
			: null,
	);
}

export function setPullRequestState(
	target: PullRequestTarget,
	state: "open" | "closed",
	deps: PullRequestGateways = gateways,
): Promise<void> {
	const { prNumber } = target;
	const projectId = target.host?.projectId;
	return act(
		target,
		deps,
		(github) =>
			github.setPullRequestState.mutate({ ...cloudInput(target), state }),
		projectId
			? (pullRequests) =>
					pullRequests.setState.mutate({ projectId, prNumber, state })
			: null,
	);
}

export function setPullRequestDraft(
	target: PullRequestTarget,
	draft: boolean,
	deps: PullRequestGateways = gateways,
): Promise<void> {
	const { prNumber } = target;
	const projectId = target.host?.projectId;
	return act(
		target,
		deps,
		(github) =>
			github.setPullRequestDraft.mutate({ ...cloudInput(target), draft }),
		projectId
			? (pullRequests) =>
					pullRequests.setDraft.mutate({ projectId, prNumber, draft })
			: null,
	);
}
