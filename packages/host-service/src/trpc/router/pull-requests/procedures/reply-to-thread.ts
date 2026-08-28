import { z } from "zod";
import { protectedProcedure } from "../../../index";
import { actionRejectionError } from "../../github/github";
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

export const replyToThread = protectedProcedure
	.input(replyToThreadInputSchema)
	.mutation(async ({ ctx, input }) => {
		const repo = await resolveGithubRepo(ctx, input.projectId);
		const octokit = await ctx.github();
		try {
			const { data } = await octokit.pulls.createReplyForReviewComment({
				owner: repo.owner,
				repo: repo.name,
				pull_number: input.prNumber,
				comment_id: input.commentId,
				body: input.body,
			});
			return { id: data.id };
		} catch (error) {
			throw actionRejectionError(error, "GitHub refused the reply.");
		}
	});
