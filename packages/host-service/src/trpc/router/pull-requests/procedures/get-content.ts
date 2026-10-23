import { z } from "zod";
import { protectedProcedure } from "../../../index";
import { resolveGithubRepo } from "../../workspace-creation/shared/project-helpers";
import { fetchPullRequestContent } from "../shared/fetch-pull-request-content";
import { fetchMergeRequestContent } from "../shared/gitlab-merge-request";

export const getContent = protectedProcedure
	.input(
		z.object({ projectId: z.string(), prNumber: z.number().int().positive() }),
	)
	.query(async ({ ctx, input }) => {
		const gitlab = await ctx.runtime.pullRequests.getGitLabRepository(
			input.projectId,
		);
		if (gitlab) {
			return fetchMergeRequestContent(gitlab, input.prNumber);
		}
		const repo = await resolveGithubRepo(ctx, input.projectId);
		return fetchPullRequestContent(repo, input.prNumber);
	});
