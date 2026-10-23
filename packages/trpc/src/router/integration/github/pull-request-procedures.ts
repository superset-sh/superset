import {
	type PullRequestDetailRead,
	pullRequestNodeId,
	readPullRequestDetail,
} from "@superset/shared/pull-request-detail";
import {
	parseReviewThreads,
	REVIEW_THREADS_QUERY,
	type ReviewThreadsQueryResult,
} from "@superset/shared/pull-request-threads";
import type { TRPCRouterRecord } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure } from "../../../trpc";
import { githubRequestError } from "./github-request-error";
import { asViewer, type ViewerPullRequest } from "./viewer-octokit";

const pullRequestInput = z.object({
	organizationId: z.string().uuid(),
	repoFullName: z.string().regex(/^[\w.-]+\/[\w.-]+$/),
	number: z.number().int().positive(),
});
// GitHub rejects bodies past 65536 characters.
const body = z.string().trim().min(1).max(65536);

async function onGithub<T>(
	fallback: string,
	run: () => Promise<T>,
): Promise<T> {
	try {
		return await run();
	} catch (error) {
		throw githubRequestError(error, fallback);
	}
}

const graphqlOf = ({ octokit }: ViewerPullRequest) => ({
	graphql: <T>(query: string, variables: Record<string, unknown>) =>
		octokit.graphql<T>(query, variables),
});

/**
 * A pull request by its own identity, read and written as the person asking.
 * Nothing here needs a project or a host: clients reach these for any PR
 * they can name.
 */
export const pullRequestProcedures = {
	/** Mergeability, checks, reviewers and the viewer's own capabilities; with `activity`, the conversation and commits too. */
	getPullRequestDetail: protectedProcedure
		.input(pullRequestInput.extend({ activity: z.boolean().optional() }))
		.query(async ({ ctx, input }): Promise<PullRequestDetailRead> => {
			const pr = await asViewer(ctx.session.user.id, input, "read");
			return onGithub(`Failed to read pull request #${pr.number}`, () =>
				readPullRequestDetail(
					{
						...graphqlOf(pr),
						requestedReviewers: async () =>
							(
								await pr.octokit.request(
									"GET /repos/{owner}/{repo}/pulls/{pull_number}/requested_reviewers",
									{ owner: pr.owner, repo: pr.repo, pull_number: pr.number },
								)
							).data,
					},
					{ owner: pr.owner, repo: pr.repo, pullNumber: pr.number },
					{ activity: input.activity },
				),
			);
		}),

	getPullRequestThreads: protectedProcedure
		.input(pullRequestInput)
		.query(async ({ ctx, input }) => {
			const pr = await asViewer(ctx.session.user.id, input, "read");
			try {
				const result = await pr.octokit.graphql<ReviewThreadsQueryResult>(
					REVIEW_THREADS_QUERY,
					{ owner: pr.owner, name: pr.repo, prNumber: pr.number },
				);
				return {
					reviewThreads: parseReviewThreads(result),
					fetchFailed: false,
				};
			} catch (error) {
				console.warn(
					`[github.getPullRequestThreads] ${input.repoFullName}#${pr.number}:`,
					error instanceof Error ? error.message : error,
				);
				// Empty rather than an error, so the diff still shows when only its
				// comments failed; `fetchFailed` keeps the two apart.
				return { reviewThreads: [], fetchFailed: true };
			}
		}),

	addPullRequestComment: protectedProcedure
		.input(pullRequestInput.extend({ body }))
		.mutation(async ({ ctx, input }) => {
			const pr = await asViewer(ctx.session.user.id, input, "write");
			const { data } = await onGithub("GitHub refused the comment.", () =>
				pr.octokit.request(
					"POST /repos/{owner}/{repo}/issues/{issue_number}/comments",
					{
						owner: pr.owner,
						repo: pr.repo,
						issue_number: pr.number,
						body: input.body,
					},
				),
			);
			return { id: data.id, url: data.html_url };
		}),

	replyToPullRequestThread: protectedProcedure
		.input(
			/** `commentId`: REST databaseId of any comment already in the thread. */
			pullRequestInput.extend({ commentId: z.number().int().positive(), body }),
		)
		.mutation(async ({ ctx, input }) => {
			const pr = await asViewer(ctx.session.user.id, input, "write");
			const { data } = await onGithub("GitHub refused the reply.", () =>
				pr.octokit.request(
					"POST /repos/{owner}/{repo}/pulls/{pull_number}/comments/{comment_id}/replies",
					{
						owner: pr.owner,
						repo: pr.repo,
						pull_number: pr.number,
						comment_id: input.commentId,
						body: input.body,
					},
				),
			);
			return { id: data.id };
		}),

	setPullRequestThreadResolution: protectedProcedure
		.input(
			pullRequestInput.extend({
				threadId: z.string().min(1),
				resolved: z.boolean(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const pr = await asViewer(ctx.session.user.id, input, "write");
			const verb = input.resolved
				? "resolveReviewThread"
				: "unresolveReviewThread";
			await onGithub("GitHub refused to update the thread.", () =>
				pr.octokit.graphql(
					`mutation($threadId: ID!) { ${verb}(input: {threadId: $threadId}) { thread { id } } }`,
					{ threadId: input.threadId },
				),
			);
			return { threadId: input.threadId, isResolved: input.resolved };
		}),

	mergePullRequest: protectedProcedure
		.input(
			pullRequestInput.extend({
				mergeMethod: z.enum(["merge", "squash", "rebase"]).default("merge"),
				commitMessage: z.string().trim().min(1).optional(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const pr = await asViewer(ctx.session.user.id, input, "write");
			const { data } = await onGithub("GitHub refused the merge.", () =>
				pr.octokit.request(
					"PUT /repos/{owner}/{repo}/pulls/{pull_number}/merge",
					{
						owner: pr.owner,
						repo: pr.repo,
						pull_number: pr.number,
						merge_method: input.mergeMethod,
						...(input.commitMessage
							? { commit_message: input.commitMessage }
							: {}),
					},
				),
			);
			return { merged: data.merged, sha: data.sha, message: data.message };
		}),

	setPullRequestState: protectedProcedure
		// Only open/closed: a merged pull request has no way back.
		.input(pullRequestInput.extend({ state: z.enum(["open", "closed"]) }))
		.mutation(async ({ ctx, input }) => {
			const pr = await asViewer(ctx.session.user.id, input, "write");
			await onGithub(
				`GitHub refused to ${input.state === "closed" ? "close" : "reopen"} the pull request.`,
				() =>
					pr.octokit.request(
						"PATCH /repos/{owner}/{repo}/pulls/{pull_number}",
						{
							owner: pr.owner,
							repo: pr.repo,
							pull_number: pr.number,
							state: input.state,
						},
					),
			);
			return { ok: true as const };
		}),

	setPullRequestDraft: protectedProcedure
		.input(pullRequestInput.extend({ draft: z.boolean() }))
		.mutation(async ({ ctx, input }) => {
			const pr = await asViewer(ctx.session.user.id, input, "write");
			const mutation = input.draft
				? "convertPullRequestToDraft"
				: "markPullRequestReadyForReview";
			await onGithub(
				input.draft
					? "GitHub refused to convert the pull request to a draft."
					: "GitHub refused to mark the pull request ready for review.",
				async () => {
					const id = await pullRequestNodeId(graphqlOf(pr), {
						owner: pr.owner,
						repo: pr.repo,
						pullNumber: pr.number,
					});
					await pr.octokit.graphql(
						`mutation($id: ID!) { ${mutation}(input: {pullRequestId: $id}) { pullRequest { isDraft } } }`,
						{ id },
					);
				},
			);
			return { ok: true as const };
		}),

	updatePullRequestBranch: protectedProcedure
		.input(pullRequestInput)
		.mutation(async ({ ctx, input }) => {
			const pr = await asViewer(ctx.session.user.id, input, "write");
			await onGithub("GitHub refused to update the branch.", () =>
				pr.octokit.request(
					"PUT /repos/{owner}/{repo}/pulls/{pull_number}/update-branch",
					{ owner: pr.owner, repo: pr.repo, pull_number: pr.number },
				),
			);
			return { ok: true as const };
		}),

	dequeuePullRequest: protectedProcedure
		.input(pullRequestInput)
		.mutation(async ({ ctx, input }) => {
			const pr = await asViewer(ctx.session.user.id, input, "write");
			await onGithub(
				"GitHub refused to remove the pull request from the queue.",
				async () => {
					const id = await pullRequestNodeId(graphqlOf(pr), {
						owner: pr.owner,
						repo: pr.repo,
						pullNumber: pr.number,
					});
					await pr.octokit.graphql(
						"mutation($id: ID!) { dequeuePullRequest(input: { id: $id }) { mergeQueueEntry { position } } }",
						{ id },
					);
				},
			);
			return { ok: true as const };
		}),
} satisfies TRPCRouterRecord;
