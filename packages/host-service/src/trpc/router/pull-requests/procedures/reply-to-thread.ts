import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { gitLabApiDeps } from "../../../../runtime/git/gitlab-api";
import {
	encodeProjectPath,
	gitlabRestPost,
} from "../../../../runtime/repo-providers/gitlab/gitlab-rest";
import { protectedProcedure } from "../../../index";
import { replyToReviewComment } from "../../git/utils/reply-to-review-comment";
import { actionRejectionError } from "../../github/github";
import { resolveGithubRepo } from "../../workspace-creation/shared/project-helpers";
import { resolveGitLabProject, resolveGitLabThread } from "./gitlab-project";

const replyToThreadInputSchema = z.object({
	projectId: z.string(),
	prNumber: z.number().int().positive(),
	/** REST databaseId of any comment already in the thread — GitHub's
	 *  reply endpoint threads the new comment onto it regardless of which
	 *  comment in the thread you target. */
	commentId: z.number().int().positive(),
	threadId: z.string().optional(),
	body: z.string().trim().min(1),
});

// Project+PR scoped, unlike git.replyToReviewThread (workspaceId scoped —
// it resolves the PR via a workspace's DB row). The Code tab browses a PR
// directly, with no workspace necessarily linked to it.
export const replyToThread = protectedProcedure
	.input(replyToThreadInputSchema)
	.mutation(async ({ ctx, input }) => {
		if (input.threadId?.startsWith("gitlab:")) {
			const { repo, discussionId } = await resolveGitLabThread(ctx, {
				...input,
				threadId: input.threadId,
			});
			try {
				const note = await gitlabRestPost<{ id: number }>(
					gitLabApiDeps(ctx.credentials, repo),
					`/projects/${encodeProjectPath(repo.owner, repo.name)}/merge_requests/${input.prNumber}/discussions/${encodeURIComponent(discussionId)}/notes`,
					{ body: input.body },
					"POST",
				);
				return { id: note.id };
			} catch (error) {
				throw actionRejectionError(error, "GitLab refused the reply.");
			}
		}
		if (await resolveGitLabProject(ctx, input.projectId)) {
			throw new TRPCError({
				code: "BAD_REQUEST",
				message: "A GitLab discussion thread ID is required",
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
