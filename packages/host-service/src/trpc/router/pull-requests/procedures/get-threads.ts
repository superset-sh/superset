import { z } from "zod";
import { protectedProcedure } from "../../../index";
import {
	type GraphQLThreadsResult,
	parseGraphQLThreads,
	REVIEW_THREADS_QUERY,
} from "../../git/utils/graphql";
import { resolveGithubRepo } from "../../workspace-creation/shared/project-helpers";

const getThreadsInputSchema = z.object({
	projectId: z.string(),
	prNumber: z.number().int().positive(),
});

export const getThreads = protectedProcedure
	.input(getThreadsInputSchema)
	.query(async ({ ctx, input }) => {
		const repo = await resolveGithubRepo(ctx, input.projectId);
		const octokit = await ctx.github();

		try {
			const result: GraphQLThreadsResult = await octokit.graphql(
				REVIEW_THREADS_QUERY,
				{
					owner: repo.owner,
					name: repo.name,
					prNumber: input.prNumber,
				},
			);
			return { reviewThreads: parseGraphQLThreads(result) };
		} catch (error) {
			console.warn(
				`[pullRequests.getThreads] Failed to fetch review threads for PR #${input.prNumber}:`,
				error,
			);
			return { reviewThreads: [] };
		}
	});
