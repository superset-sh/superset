import { z } from "zod";
import { protectedProcedure } from "../../../index";
import { resolveGithubRepo } from "../../workspace-creation/shared/project-helpers";
import { fetchPullRequestContent } from "../shared/fetch-pull-request-content";

export const getContent = protectedProcedure
	.input(
		z.object({ projectId: z.string(), prNumber: z.number().int().positive() }),
	)
	.query(async ({ ctx, input }) => {
		const repo = await resolveGithubRepo(ctx, input.projectId);
		return fetchPullRequestContent(repo, input.prNumber);
	});
