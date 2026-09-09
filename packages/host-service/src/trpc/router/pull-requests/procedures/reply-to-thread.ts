import { z } from "zod";
import { protectedProcedure } from "../../../index";
import { replyToReviewComment } from "../../git/utils/reply-to-review-comment";
import { resolveGithubRepo } from "../../workspace-creation/shared/project-helpers";

const replyToThreadInputSchema = z.object({
	projectId: z.string(),
	prNumber: z.number().int().positive(),
	/** REST databaseId of any comment already in the thread — GitHub's
	 *  reply endpoint threads the new comment onto it regardless of which
	 *  comment in the thread you target. */
	commentId: z.number().int().positive(),
	body: z.string().trim().min(1),
});

// Project+PR scoped, unlike git.replyToReviewThread (workspaceId scoped —
// it resolves the PR via a workspace's DB row). The Code tab browses a PR
// directly, with no workspace necessarily linked to it.
export const replyToThread = protectedProcedure
	.input(replyToThreadInputSchema)
	.mutation(async ({ ctx, input }) => {
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
