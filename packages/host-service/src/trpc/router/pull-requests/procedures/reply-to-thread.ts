import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
	assertGitLabIdentity,
	gitLabMergeRequestApiPath,
} from "../../../../source-control/gitlab/merge-requests";
import { protectedProcedure } from "../../../index";
import { replyToReviewComment } from "../../git/utils/reply-to-review-comment";
import {
	resolveGithubRepo,
	resolveGitLabRepo,
} from "../../workspace-creation/shared/project-helpers";

const replyToThreadInputSchema = z.object({
	projectId: z.string(),
	prNumber: z.number().int().positive(),
	provider: z.enum(["github", "gitlab"]).optional(),
	instance: z.string().optional(),
	repoPath: z.string().optional(),
	discussionId: z.string().optional(),
	/** REST databaseId of any comment already in the thread — GitHub's
	 *  reply endpoint threads the new comment onto it regardless of which
	 *  comment in the thread you target. */
	commentId: z.number().int().positive().optional(),
	body: z.string().trim().min(1),
});

// Project+PR scoped, unlike git.replyToReviewThread (workspaceId scoped —
// it resolves the PR via a workspace's DB row). The Code tab browses a PR
// directly, with no workspace necessarily linked to it.
export const replyToThread = protectedProcedure
	.input(replyToThreadInputSchema)
	.mutation(async ({ ctx, input }) => {
		if (input.provider === "gitlab") {
			if (!input.discussionId) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "GitLab discussion ID is required",
				});
			}
			const identity = await resolveGitLabRepo(ctx, input.projectId);
			assertGitLabIdentity(identity, input);
			return ctx.gitlab.api(
				identity,
				`${gitLabMergeRequestApiPath(identity, input.prNumber)}/discussions/${encodeURIComponent(input.discussionId)}/notes`,
				{ method: "POST", fields: { body: input.body } },
			);
		}
		if (!input.commentId) {
			throw new TRPCError({
				code: "BAD_REQUEST",
				message: "Review comment ID is required",
			});
		}
		const repo = await resolveGithubRepo(ctx, input.projectId);
		const octokit = await ctx.github();
		return replyToReviewComment(octokit, {
			owner: repo.owner,
			repo: repo.name,
			prNumber: input.prNumber,
			commentId: input.commentId,
			body: input.body,
		});
	});
