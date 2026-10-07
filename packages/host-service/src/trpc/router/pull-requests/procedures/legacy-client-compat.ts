import type { ParsedRemote } from "@superset/shared/git-remote";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import type { PullRequestCapabilities } from "../../../../runtime/repo-providers/types";
import type { HostServiceContext } from "../../../../types";
import { protectedProcedure, router } from "../../../index";
import { actionRejectionError, githubRouter } from "../../github/github";
import { resolveRepo } from "../../workspace-creation/shared/project-helpers";
import { getContent } from "./get-content";
import { gitLabClient } from "./gitlab-project";

const projectInput = z.object({
	projectId: z.string(),
	prNumber: z.number().int().positive(),
});
const actionInput = projectInput.extend({ expectedUrl: z.string().url() });
const contentRouter = router({ getContent });

function invalidIdentity() {
	return new TRPCError({
		code: "BAD_REQUEST",
		message: "Pull request identity changed; refresh before trying this action",
	});
}

function assertIdentity(
	repo: ParsedRemote,
	number: number,
	expectedUrl: string,
) {
	try {
		if (/[\s\\]/.test(expectedUrl)) throw invalidIdentity();
		const url = new URL(expectedUrl);
		const native = repo.provider !== "github";
		const path = `/${repo.owner}/${repo.name}/${native ? "-/merge_requests" : "pull"}/${number}`;
		const rawPath = expectedUrl
			.match(/^https:\/\/[^/?#]+([^?#]*)/i)?.[1]
			?.replace(/\/$/, "");
		if (
			url.protocol !== "https:" ||
			url.username ||
			url.password ||
			url.search ||
			url.hash ||
			url.host !== repo.host ||
			(native
				? rawPath !== path
				: rawPath?.toLowerCase() !== path.toLowerCase())
		)
			throw invalidIdentity();
	} catch {
		throw invalidIdentity();
	}
}

export async function resolveLegacyPullRequest(
	ctx: HostServiceContext,
	input: { projectId: string; prNumber: number; expectedUrl?: string },
) {
	const resolve = () =>
		resolveRepo(ctx, input.projectId, {
			validateRemote(remote) {
				if (input.expectedUrl)
					assertIdentity(remote, input.prNumber, input.expectedUrl);
			},
		});
	const repo = await resolve();
	if (repo.provider !== "github" && repo.provider !== "gitlab")
		throw invalidIdentity();
	if (input.expectedUrl)
		assertIdentity(repo, input.prNumber, input.expectedUrl);
	if (!input.expectedUrl) return repo;
	const current = await resolve();
	if (current.provider !== repo.provider) throw invalidIdentity();
	assertIdentity(current, input.prNumber, input.expectedUrl);
	return current;
}

/** @deprecated Retained for released clients. */
export const getDetail = protectedProcedure
	.input(projectInput)
	.query(async ({ ctx, input }) => {
		const repo = await resolveLegacyPullRequest(ctx, input);
		const content = await contentRouter.createCaller(ctx).getContent(input);
		if (content.number !== input.prNumber) throw invalidIdentity();
		assertIdentity(repo, input.prNumber, content.url);
		const state =
			content.state === "merged"
				? "merged"
				: content.state === "open" ||
						content.state === "opened" ||
						content.state === "locked"
					? "open"
					: "closed";
		const pullRequest = { ...content, state };
		if (repo.provider === "gitlab") {
			const client = gitLabClient(ctx, repo);
			try {
				const [reviewState, capabilities] = await Promise.all([
					client.fetchReviewState(repo, input.prNumber, state),
					client.pullRequestCapabilities(repo, input.prNumber),
				]);
				return {
					githubDetail: null,
					provider: "gitlab" as const,
					host: repo.host,
					pullRequest,
					reviewState,
					capabilities,
				};
			} catch (error) {
				throw actionRejectionError(
					error,
					"GitLab refused the merge request detail query.",
				);
			}
		}
		const githubDetail = await githubRouter
			.createCaller(ctx)
			.getPullRequestDetail({
				provider: "github",
				owner: repo.owner,
				repo: repo.name,
				pullNumber: input.prNumber,
			});
		if (
			"provider" in githubDetail ||
			githubDetail.pullRequest.number !== input.prNumber
		)
			throw invalidIdentity();
		assertIdentity(repo, input.prNumber, githubDetail.pullRequest.url);
		const capabilities: PullRequestCapabilities = {
			...githubDetail.capabilities,
			close:
				githubDetail.pullRequest.state === "open" &&
				githubDetail.capabilities.merge,
			mergePolicy: {
				provider: "github",
				allowedMethods: githubDetail.mergeability.allowedMergeMethods.filter(
					(method): method is "merge" | "squash" | "rebase" =>
						method === "merge" || method === "squash" || method === "rebase",
				),
			},
		};
		return {
			githubDetail,
			provider: "github" as const,
			host: repo.host,
			pullRequest,
			reviewState: {
				provider: "github" as const,
				reviewDecision: githubDetail.mergeability.reviewDecision,
			},
			capabilities,
		};
	});

function legacyAction(
	action:
		| "markPullRequestReady"
		| "updatePullRequestBranch"
		| "dequeuePullRequest",
) {
	return protectedProcedure
		.input(actionInput)
		.mutation(async ({ ctx, input }) => {
			const repo = await resolveLegacyPullRequest(ctx, input);
			const caller = githubRouter.createCaller(ctx);
			await caller[action]({
				provider: repo.provider === "gitlab" ? "gitlab" : "github",
				host: repo.host,
				projectId: input.projectId,
				owner: repo.owner,
				repo: repo.name,
				pullNumber: input.prNumber,
				expectedUrl: input.expectedUrl,
			});
			return { ok: true };
		});
}

/** @deprecated Retained for released clients. */
export const markReady = legacyAction("markPullRequestReady");
/** @deprecated Retained for released clients. */
export const updateBranch = legacyAction("updatePullRequestBranch");
/** @deprecated Retained for released clients. */
export const dequeue = legacyAction("dequeuePullRequest");
