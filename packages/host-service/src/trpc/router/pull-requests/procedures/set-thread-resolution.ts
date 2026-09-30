import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
	assertGitLabIdentity,
	gitLabMergeRequestApiPath,
} from "../../../../source-control/gitlab/merge-requests";
import { protectedProcedure } from "../../../index";
import { resolveGitLabRepo } from "../../workspace-creation/shared/project-helpers";

const setThreadResolutionInputSchema = z.object({
	threadId: z.string(),
	resolved: z.boolean(),
	provider: z.enum(["github", "gitlab"]).optional(),
	projectId: z.string().optional(),
	prNumber: z.number().int().positive().optional(),
	instance: z.string().optional(),
	repoPath: z.string().optional(),
});

// GitHub review-thread IDs are globally unique, so this needs no
// project/PR context to resolve or unresolve one — unlike
// git.setReviewThreadResolution, which takes a workspaceId only to
// invalidate that workspace's thread cache after the mutation.
export const setThreadResolution = protectedProcedure
	.input(setThreadResolutionInputSchema)
	.mutation(async ({ ctx, input }) => {
		if (input.provider === "gitlab") {
			if (!input.projectId || !input.prNumber) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "GitLab project and merge request are required",
				});
			}
			const identity = await resolveGitLabRepo(ctx, input.projectId);
			assertGitLabIdentity(identity, input);
			await ctx.gitlab.api(
				identity,
				`${gitLabMergeRequestApiPath(identity, input.prNumber)}/discussions/${encodeURIComponent(input.threadId)}`,
				{ method: "PUT", fields: { resolved: input.resolved } },
			);
			return { threadId: input.threadId, isResolved: input.resolved };
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
