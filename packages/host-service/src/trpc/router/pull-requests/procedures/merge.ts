import { z } from "zod";
import { protectedProcedure } from "../../../index";
import { actionRejectionError } from "../../github/github";
import { resolveGithubRepo } from "../../workspace-creation/shared/project-helpers";

const mergeInputSchema = z.object({
	projectId: z.string(),
	prNumber: z.number().int().positive(),
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
