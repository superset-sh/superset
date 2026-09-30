import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure } from "../../../index";
import { setPullRequestDiscussionResolutionFromGlab } from "../../git/utils/gitlab-discussions";
import { resolvePullRequestRepository } from "../resolve-repository";

const setThreadResolutionInputSchema = z.object({
	projectId: z.string().optional(),
	prNumber: z.number().int().positive().optional(),
	threadId: z.string(),
	resolved: z.boolean(),
});

// GitHub review-thread IDs are globally unique, so this needs no
// project/PR context to resolve or unresolve one — unlike
// git.setReviewThreadResolution, which takes a workspaceId only to
// invalidate that workspace's thread cache after the mutation.
export const setThreadResolution = protectedProcedure
	.input(setThreadResolutionInputSchema)
	.mutation(async ({ ctx, input }) => {
		if (input.projectId) {
			const repo = await resolvePullRequestRepository(ctx, input.projectId);
			if (repo.provider === "gitlab") {
				if (!input.prNumber)
					throw new TRPCError({
						code: "BAD_REQUEST",
						message: "Merge request number is required",
					});
				await setPullRequestDiscussionResolutionFromGlab(
					ctx.execGlab,
					repo,
					input.prNumber,
					input.threadId,
					input.resolved,
					repo.repoPath,
				);
				return { threadId: input.threadId, isResolved: input.resolved };
			}
		}
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
