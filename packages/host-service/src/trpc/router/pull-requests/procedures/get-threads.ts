import { z } from "zod";
import {
	assertGitLabIdentity,
	getGitLabMergeRequestThreads,
} from "../../../../source-control/gitlab/merge-requests";
import { protectedProcedure } from "../../../index";
import {
	type GraphQLThreadsResult,
	parseGraphQLThreads,
	REVIEW_THREADS_QUERY,
} from "../../git/utils/graphql";
import {
	resolveGithubRepo,
	resolveGitLabRepo,
} from "../../workspace-creation/shared/project-helpers";

const getThreadsInputSchema = z.object({
	projectId: z.string(),
	prNumber: z.number().int().positive(),
	provider: z.enum(["github", "gitlab"]).optional(),
	instance: z.string().optional(),
	repoPath: z.string().optional(),
});

// Project+PR scoped, unlike git.getPullRequestThreads (workspaceId scoped —
// it resolves the PR via a workspace's DB row). The Code tab browses a PR
// directly, with no workspace necessarily linked to it, so it needs its own
// entry point onto the same GraphQL query/parser.
export const getThreads = protectedProcedure
	.input(getThreadsInputSchema)
	.query(async ({ ctx, input }) => {
		if (input.provider === "gitlab") {
			const identity = await resolveGitLabRepo(ctx, input.projectId);
			assertGitLabIdentity(identity, input);
			try {
				return {
					reviewThreads: await getGitLabMergeRequestThreads(
						ctx.gitlab,
						identity,
						input.prNumber,
					),
					fetchFailed: false,
				};
			} catch {
				return { reviewThreads: [], fetchFailed: true };
			}
		}
		const repo = await resolveGithubRepo(ctx, input.projectId);
		const octokit = await ctx.github();

		try {
			const result: GraphQLThreadsResult = await octokit.graphql(
				REVIEW_THREADS_QUERY,
				{ owner: repo.owner, name: repo.name, prNumber: input.prNumber },
			);
			return { reviewThreads: parseGraphQLThreads(result), fetchFailed: false };
		} catch (error) {
			console.warn(
				`[pullRequests.getThreads] Failed to fetch review threads for PR #${input.prNumber}:`,
				error,
			);
			// Degrades to an empty list rather than throwing (mirrors
			// git.getPullRequestThreads) so a comments-fetch failure doesn't
			// block the diff view itself. fetchFailed lets the caller tell
			// "really no comments" apart from "couldn't load them" instead
			// of silently rendering a clean-looking diff either way.
			return { reviewThreads: [], fetchFailed: true };
		}
	});
