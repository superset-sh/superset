import { TRPCError } from "@trpc/server";
import { protectedProcedure } from "../../../index";
import { githubIssueContentInputSchema } from "../schemas";
import { fetchGithubIssueContent } from "../shared/github-content";

// Shell out to the user's `gh` CLI rather than host-service's
// octokit — `gh auth login` works out of the box while the
// credential-manager path requires setup most users don't have.
// Matches V1's projects.getIssueContent behavior.
export const getGitHubIssueContent = protectedProcedure
	.input(githubIssueContentInputSchema)
	.query(async ({ ctx, input }) => {
		try {
			return await fetchGithubIssueContent(
				ctx,
				input.projectId,
				input.issueNumber,
			);
		} catch (err) {
			throw new TRPCError({
				code: "INTERNAL_SERVER_ERROR",
				message: `Failed to fetch issue #${input.issueNumber}: ${err instanceof Error ? err.message : String(err)}`,
			});
		}
	});
