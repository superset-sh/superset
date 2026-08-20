import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, queryProcedure } from "../../../index";
import type { IssueComment, PullRequestReviewThread } from "../../git/types";
import {
	type GraphQLThreadsResult,
	parseGraphQLThreads,
	REVIEW_THREADS_QUERY,
} from "../../git/utils/graphql";
import { resolveGithubRepo } from "../../workspace-creation/shared/project-helpers";

const getThreadsInputSchema = z.object({
	projectId: z.string(),
	prNumber: z.number().int().positive(),
});

export interface PullRequestThreadsResult {
	reviewThreads: PullRequestReviewThread[];
	conversationComments: IssueComment[];
}

/**
 * Standalone (no workspace) equivalent of git.getPullRequestThreads — same
 * GraphQL/REST calls, keyed by projectId+prNumber instead of a workspace's
 * linked PR, for the PR detail page's Review tab.
 */
export const getThreads = queryProcedure
	.meta({ timeoutMs: 30_000 })
	.input(getThreadsInputSchema)
	.query(async ({ ctx, input }): Promise<PullRequestThreadsResult> => {
		const repo = await resolveGithubRepo(ctx, input.projectId);
		const octokit = await ctx.github();

		let reviewThreads: PullRequestReviewThread[] = [];
		try {
			const result: GraphQLThreadsResult = await octokit.graphql(
				REVIEW_THREADS_QUERY,
				{
					owner: repo.owner,
					name: repo.name,
					prNumber: input.prNumber,
				},
			);
			reviewThreads = parseGraphQLThreads(result);
		} catch (error) {
			console.warn(
				"[pullRequests.getThreads] Failed to fetch review threads:",
				error,
			);
		}

		const conversationComments: IssueComment[] = [];
		try {
			let page = 1;
			let hasMore = true;
			while (hasMore) {
				const { data: comments } = await octokit.issues.listComments({
					owner: repo.owner,
					repo: repo.name,
					issue_number: input.prNumber,
					per_page: 100,
					page,
				});
				for (const c of comments) {
					const body = c.body?.trim();
					if (!body) continue;
					conversationComments.push({
						id: c.id,
						user: {
							login: c.user?.login ?? "ghost",
							avatarUrl: c.user?.avatar_url ?? "",
						},
						body,
						createdAt: c.created_at ?? "",
						htmlUrl: c.html_url ?? "",
					});
				}
				hasMore = comments.length === 100;
				page++;
			}
		} catch (error) {
			console.warn(
				"[pullRequests.getThreads] Failed to fetch conversation comments:",
				error,
			);
		}

		return { reviewThreads, conversationComments };
	});

export const setThreadResolution = protectedProcedure
	.input(
		z.object({
			threadId: z.string(),
			resolved: z.boolean(),
		}),
	)
	.mutation(async ({ ctx, input }) => {
		const octokit = await ctx.github();
		const mutation = input.resolved
			? `mutation($threadId: ID!) {
					resolveReviewThread(input: {threadId: $threadId}) {
						thread { id isResolved }
					}
				}`
			: `mutation($threadId: ID!) {
					unresolveReviewThread(input: {threadId: $threadId}) {
						thread { id isResolved }
					}
				}`;

		try {
			await octokit.graphql(mutation, { threadId: input.threadId });
		} catch (error) {
			const message =
				error instanceof Error ? error.message : "GraphQL mutation failed";
			throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message });
		}

		return { threadId: input.threadId, isResolved: input.resolved };
	});
