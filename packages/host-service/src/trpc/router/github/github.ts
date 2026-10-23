import {
	PullRequestReadError,
	readPullRequestDetail,
	pullRequestNodeId as sharedPullRequestNodeId,
} from "@superset/shared/pull-request-detail";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "../../index";
import { createGithubWorkItemLoader } from "./work-item";

const loadWorkItem = createGithubWorkItemLoader();

export const githubRouter = router({
	/** A pull request or issue at a glance, for a chip's hover card. */
	getWorkItem: protectedProcedure
		.input(
			z.object({
				owner: z.string().min(1),
				repo: z.string().min(1),
				kind: z.enum(["pr", "issue"]),
				number: z.number().int().positive(),
			}),
		)
		.query(async ({ ctx, input }) => loadWorkItem(await ctx.github(), input)),

	getPRStatus: protectedProcedure
		.input(
			z.object({
				owner: z.string(),
				repo: z.string(),
				branch: z.string(),
			}),
		)
		.query(async ({ ctx, input }) => {
			const octokit = await ctx.github();
			const { data } = await octokit.pulls.list({
				owner: input.owner,
				repo: input.repo,
				head: `${input.owner}:${input.branch}`,
				state: "open",
			});
			return data[0] ?? null;
		}),

	/** @deprecated Use the API's `integration.github.getPullRequestDetail` with `activity: true`, which acts as the viewer. Kept for released clients. */
	getPR: protectedProcedure
		.input(
			z.object({
				owner: z.string(),
				repo: z.string(),
				pullNumber: z.number(),
			}),
		)
		.query(async ({ ctx, input }) => {
			const octokit = await ctx.github();
			const { data } = await octokit.pulls.get({
				owner: input.owner,
				repo: input.repo,
				pull_number: input.pullNumber,
			});
			return data;
		}),

	listPRs: protectedProcedure
		.input(
			z.object({
				owner: z.string(),
				repo: z.string(),
				state: z.enum(["open", "closed", "all"]).default("open"),
				sort: z
					.enum(["created", "updated", "popularity", "long-running"])
					.default("updated"),
				direction: z.enum(["asc", "desc"]).default("desc"),
				perPage: z.number().min(1).max(100).default(30),
				page: z.number().min(1).default(1),
			}),
		)
		.query(async ({ ctx, input }) => {
			const octokit = await ctx.github();
			const { data } = await octokit.pulls.list({
				owner: input.owner,
				repo: input.repo,
				state: input.state,
				sort: input.sort,
				direction: input.direction,
				per_page: input.perPage,
				page: input.page,
			});
			return data;
		}),

	getRepo: protectedProcedure
		.input(
			z.object({
				owner: z.string(),
				repo: z.string(),
			}),
		)
		.query(async ({ ctx, input }) => {
			const octokit = await ctx.github();
			const { data } = await octokit.repos.get({
				owner: input.owner,
				repo: input.repo,
			});
			return data;
		}),

	listDeployments: protectedProcedure
		.input(
			z.object({
				owner: z.string(),
				repo: z.string(),
				environment: z.string().optional(),
				ref: z.string().optional(),
				perPage: z.number().min(1).max(100).default(10),
			}),
		)
		.query(async ({ ctx, input }) => {
			const octokit = await ctx.github();
			const { data } = await octokit.repos.listDeployments({
				owner: input.owner,
				repo: input.repo,
				environment: input.environment,
				ref: input.ref,
				per_page: input.perPage,
			});
			return data;
		}),

	listDeploymentStatuses: protectedProcedure
		.input(
			z.object({
				owner: z.string(),
				repo: z.string(),
				deploymentId: z.number(),
				perPage: z.number().min(1).max(100).default(10),
			}),
		)
		.query(async ({ ctx, input }) => {
			const octokit = await ctx.github();
			const { data } = await octokit.repos.listDeploymentStatuses({
				owner: input.owner,
				repo: input.repo,
				deployment_id: input.deploymentId,
				per_page: input.perPage,
			});
			return data;
		}),

	getUser: protectedProcedure.query(async ({ ctx }) => {
		const octokit = await ctx.github();
		const { data } = await octokit.users.getAuthenticated();
		return data;
	}),

	/**
	 * Everything one pull request view needs.
	 *
	 * Deliberately GraphQL and deliberately live: mergeability, per-viewer
	 * capabilities, reviewer states and whether a check is required exist
	 * nowhere in the synced rows, and a button offered on stale data is a
	 * button that fails when pressed.
	 *
	 * @deprecated Use the API's `integration.github.getPullRequestDetail`, which acts as the viewer. Kept for released clients.
	 */
	getPullRequestDetail: protectedProcedure
		.input(
			z.object({
				owner: z.string(),
				repo: z.string(),
				pullNumber: z.number(),
			}),
		)
		.query(async ({ ctx, input }) => {
			const octokit = await ctx.github();
			try {
				return await readPullRequestDetail(
					{
						graphql: (query, variables) => octokit.graphql(query, variables),
						requestedReviewers: async ({ owner, repo, pullNumber }) =>
							(
								await octokit.pulls.listRequestedReviewers({
									owner,
									repo,
									pull_number: pullNumber,
								})
							).data,
					},
					input,
				);
			} catch (error) {
				throw readError(error);
			}
		}),

	/** @deprecated Use the API's `integration.github.mergePullRequest`, which acts as the viewer. Kept for released clients. */
	mergePR: protectedProcedure
		.input(
			z.object({
				owner: z.string(),
				repo: z.string(),
				pullNumber: z.number(),
				mergeMethod: z.enum(["merge", "squash", "rebase"]).default("merge"),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const octokit = await ctx.github();
			try {
				const { data } = await octokit.pulls.merge({
					owner: input.owner,
					repo: input.repo,
					pull_number: input.pullNumber,
					merge_method: input.mergeMethod,
				});
				return data;
			} catch (error) {
				throw actionRejectionError(error, "GitHub refused the merge.");
			}
		}),

	/** @deprecated Use the API's `integration.github.setPullRequestDraft` with `draft: false`, which acts as the viewer. Kept for released clients. */
	markPullRequestReady: protectedProcedure
		.input(
			z.object({
				owner: z.string(),
				repo: z.string(),
				pullNumber: z.number(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const octokit = await ctx.github();
			try {
				const id = await pullRequestNodeId(octokit, input);
				await octokit.graphql(
					`mutation($id: ID!) {
						markPullRequestReadyForReview(input: { pullRequestId: $id }) {
							pullRequest { isDraft }
						}
					}`,
					{ id },
				);
			} catch (error) {
				throw actionRejectionError(
					error,
					"GitHub refused to mark the pull request ready.",
				);
			}
		}),

	/** @deprecated Use the API's `integration.github.updatePullRequestBranch`, which acts as the viewer. Kept for released clients. */
	updatePullRequestBranch: protectedProcedure
		.input(
			z.object({
				owner: z.string(),
				repo: z.string(),
				pullNumber: z.number(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const octokit = await ctx.github();
			try {
				await octokit.pulls.updateBranch({
					owner: input.owner,
					repo: input.repo,
					pull_number: input.pullNumber,
				});
			} catch (error) {
				throw actionRejectionError(
					error,
					"GitHub refused to update the branch.",
				);
			}
		}),

	/** @deprecated Use the API's `integration.github.setPullRequestState` with `state: "open"`, which acts as the viewer. Kept for released clients. */
	reopenPullRequest: protectedProcedure
		.input(
			z.object({
				owner: z.string(),
				repo: z.string(),
				pullNumber: z.number(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const octokit = await ctx.github();
			try {
				await octokit.pulls.update({
					owner: input.owner,
					repo: input.repo,
					pull_number: input.pullNumber,
					state: "open",
				});
			} catch (error) {
				throw actionRejectionError(
					error,
					"GitHub refused to reopen the pull request.",
				);
			}
		}),

	/** @deprecated Use the API's `integration.github.dequeuePullRequest`, which acts as the viewer. Kept for released clients. */
	dequeuePullRequest: protectedProcedure
		.input(
			z.object({
				owner: z.string(),
				repo: z.string(),
				pullNumber: z.number(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const octokit = await ctx.github();
			try {
				const id = await pullRequestNodeId(octokit, input);
				await octokit.graphql(
					`mutation($id: ID!) {
						dequeuePullRequest(input: { id: $id }) {
							mergeQueueEntry { position }
						}
					}`,
					{ id },
				);
			} catch (error) {
				throw actionRejectionError(
					error,
					"GitHub refused to remove the pull request from the queue.",
				);
			}
		}),
});

function readError(error: unknown): unknown {
	return error instanceof PullRequestReadError
		? new TRPCError({ code: error.code, message: error.message })
		: error;
}

async function pullRequestNodeId(
	octokit: {
		graphql: <T>(
			query: string,
			variables: Record<string, unknown>,
		) => Promise<T>;
	},
	input: { owner: string; repo: string; pullNumber: number },
): Promise<string> {
	try {
		return await sharedPullRequestNodeId(
			{ graphql: (query, variables) => octokit.graphql(query, variables) },
			input,
		);
	} catch (error) {
		throw readError(error);
	}
}

/**
 * GitHub rejects pull request actions for conflicts, branch protection,
 * missing reviews and stale heads. Those are states of the PR, not host bugs,
 * so they get a non-500 code (500s page Sentry) and GitHub's own wording,
 * which is the only text that says which of them happened.
 */
export function actionRejectionError(
	error: unknown,
	fallback: string,
): TRPCError {
	if (error instanceof TRPCError) return error;

	const status =
		typeof error === "object" && error !== null && "status" in error
			? Number((error as { status: unknown }).status)
			: null;
	const message =
		error instanceof Error && error.message ? error.message : fallback;

	// GraphQL rejections arrive as errors in a 200 response — no status, but
	// still the PR's state talking (already queued, not in a queue, not draft).
	if (
		status === null &&
		typeof error === "object" &&
		error !== null &&
		"errors" in error
	) {
		return new TRPCError({ code: "BAD_REQUEST", message, cause: error });
	}

	switch (status) {
		// 405 not mergeable (conflicts/draft), 409 head branch moved on.
		case 405:
		case 409:
			return new TRPCError({ code: "CONFLICT", message, cause: error });
		case 401:
			return new TRPCError({ code: "UNAUTHORIZED", message, cause: error });
		case 403:
			return new TRPCError({ code: "FORBIDDEN", message, cause: error });
		case 404:
			return new TRPCError({ code: "NOT_FOUND", message, cause: error });
		case 422:
			return new TRPCError({ code: "BAD_REQUEST", message, cause: error });
		default:
			return new TRPCError({
				code: "INTERNAL_SERVER_ERROR",
				message,
				cause: error,
			});
	}
}
