import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { GitLabError } from "../../../../source-control/gitlab/exec-glab";
import {
	assertGitLabIdentity,
	gitLabMergeRequestApiPath,
} from "../../../../source-control/gitlab/merge-requests";
import { protectedProcedure } from "../../../index";
import { actionRejectionError } from "../../github/github";
import {
	resolveGithubRepo,
	resolveGitLabRepo,
} from "../../workspace-creation/shared/project-helpers";

const mergeInputSchema = z.object({
	projectId: z.string(),
	prNumber: z.number().int().positive(),
	provider: z.enum(["github", "gitlab"]).optional(),
	instance: z.string().optional(),
	repoPath: z.string().optional(),
	headSha: z
		.string()
		.regex(/^[a-f\d]{40,64}$/i)
		.optional(),
	mergeMethod: z.enum(["merge", "squash", "rebase"]).default("merge"),
	commitMessage: z.string().trim().min(1).optional(),
});

/**
 * Project-scoped merge: resolves the repo live via resolveGithubRepo, same
 * as setState, instead of trusting a project's cached repoOwner/repoName —
 * those go stale if the remote is renamed or re-pointed after setup.
 */
export const mergePR = protectedProcedure
	.input(mergeInputSchema)
	.mutation(async ({ ctx, input }) => {
		if (input.provider === "gitlab") {
			const identity = await resolveGitLabRepo(ctx, input.projectId);
			assertGitLabIdentity(identity, input);
			if (!input.headSha) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "A reviewed head SHA is required to merge a GitLab request",
				});
			}
			if (input.mergeMethod === "rebase") {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message:
						"Rebase merge is not available through the GitLab merge request API",
				});
			}
			try {
				return await ctx.gitlab.api(
					identity,
					`${gitLabMergeRequestApiPath(identity, input.prNumber)}/merge`,
					{
						method: "PUT",
						fields: {
							sha: input.headSha,
							squash: input.mergeMethod === "squash",
							...(input.commitMessage
								? { merge_commit_message: input.commitMessage }
								: {}),
						},
					},
				);
			} catch (error) {
				if (error instanceof GitLabError && error.kind === "CONFLICT") {
					throw new TRPCError({
						code: "CONFLICT",
						message:
							"The merge request changed since it was reviewed. Refresh and try again.",
					});
				}
				throw error;
			}
		}
		const repo = await resolveGithubRepo(ctx, input.projectId);
		const octokit = await ctx.github();
		try {
			const { data } = await octokit.pulls.merge({
				owner: repo.owner,
				repo: repo.name,
				pull_number: input.prNumber,
				merge_method: input.mergeMethod,
				...(input.commitMessage ? { commit_message: input.commitMessage } : {}),
			});
			return data;
		} catch (error) {
			throw actionRejectionError(error, "GitHub refused the merge.");
		}
	});
