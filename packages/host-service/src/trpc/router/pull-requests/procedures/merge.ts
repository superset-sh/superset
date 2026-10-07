import { z } from "zod";
import { protectedProcedure } from "../../../index";
import { actionRejectionError } from "../../github/github";
import { resolveGithubRepo } from "../../workspace-creation/shared/project-helpers";
import { syncPullRequestAfterWrite } from "../shared/sync-after-write";
import { syncGitLabPullRequestAfterWrite } from "../shared/sync-gitlab-after-write";
import {
	gitLabClient,
	invalidateGitLabReads,
	resolveGitLabProject,
} from "./gitlab-project";
import { resolveLegacyPullRequest } from "./legacy-client-compat";

const mergeInputSchema = z.object({
	projectId: z.string(),
	prNumber: z.number().int().positive(),
	expectedUrl: z.string().url().optional(),
	squash: z.boolean().optional(),
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
		const selected = input.expectedUrl
			? await resolveLegacyPullRequest(ctx, input)
			: null;
		const gitlab = selected
			? selected.provider === "gitlab"
				? { repo: selected, client: gitLabClient(ctx, selected) }
				: null
			: await resolveGitLabProject(ctx, input.projectId);
		if (gitlab) {
			let result: Awaited<ReturnType<typeof gitlab.client.mergePullRequest>>;
			try {
				result = await gitlab.client.mergePullRequest(
					gitlab.repo,
					input.prNumber,
					input.mergeMethod,
					{ commitMessage: input.commitMessage, squash: input.squash },
				);
			} catch (error) {
				throw actionRejectionError(error, "GitLab refused the merge.");
			}
			invalidateGitLabReads(gitlab.repo, input.prNumber);
			await syncGitLabPullRequestAfterWrite(ctx, {
				repo: gitlab.repo,
				prNumber: input.prNumber,
				expectedUrl: input.expectedUrl,
				action: "merge",
				merged: result.merged,
			});
			return result;
		}
		const repo = selected ?? (await resolveGithubRepo(ctx, input.projectId));
		const octokit = await ctx.github();
		let merged: Awaited<ReturnType<typeof octokit.pulls.merge>>["data"];
		try {
			const { data } = await octokit.pulls.merge({
				owner: repo.owner,
				repo: repo.name,
				pull_number: input.prNumber,
				merge_method: input.mergeMethod,
				...(input.commitMessage ? { commit_message: input.commitMessage } : {}),
			});
			merged = data;
		} catch (error) {
			throw actionRejectionError(error, "GitHub refused the merge.");
		}
		await syncPullRequestAfterWrite(ctx, {
			repo,
			prNumber: input.prNumber,
			action: "merge",
		});
		return merged;
	});
