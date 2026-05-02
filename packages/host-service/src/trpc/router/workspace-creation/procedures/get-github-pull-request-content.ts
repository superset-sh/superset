import { TRPCError } from "@trpc/server";
import { protectedProcedure } from "../../../index";
import { githubPullRequestContentInputSchema } from "../schemas";
import { fetchGithubPullRequestContent } from "../shared/github-content";

export const getGitHubPullRequestContent = protectedProcedure
	.input(githubPullRequestContentInputSchema)
	.query(async ({ ctx, input }) => {
		try {
			return await fetchGithubPullRequestContent(
				ctx,
				input.projectId,
				input.prNumber,
			);
		} catch (err) {
			throw new TRPCError({
				code: "INTERNAL_SERVER_ERROR",
				message: `Failed to fetch PR #${input.prNumber}: ${err instanceof Error ? err.message : String(err)}`,
			});
		}
	});
