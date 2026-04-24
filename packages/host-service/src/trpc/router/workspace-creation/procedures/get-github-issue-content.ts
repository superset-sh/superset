import { TRPCError } from "@trpc/server";
import { protectedProcedure } from "../../../index";
import { githubIssueContentInputSchema, issueContentSchema } from "../schemas";
import { resolveGithubRepo } from "../shared/project-helpers";
import { execGh } from "../utils/exec-gh";

// Shell out to the user's `gh` CLI rather than host-service's
// octokit — `gh auth login` works out of the box while the
// credential-manager path requires setup most users don't have.
// Matches V1's projects.getIssueContent behavior.
export const getGitHubIssueContent = protectedProcedure
	.input(githubIssueContentInputSchema)
	.query(async ({ ctx, input }) => {
		const repo = await resolveGithubRepo(ctx, input.projectId);
		try {
			const raw = await execGh([
				"issue",
				"view",
				String(input.issueNumber),
				"--repo",
				`${repo.owner}/${repo.name}`,
				"--json",
				"number,title,body,url,state,author,createdAt,updatedAt",
			]);
			const data = issueContentSchema.parse(raw);
			return {
				number: data.number,
				title: data.title,
				body: data.body ?? "",
				url: data.url,
				state: data.state.toLowerCase(),
				author: data.author?.login ?? null,
				createdAt: data.createdAt,
				updatedAt: data.updatedAt,
			};
		} catch (err) {
			throw new TRPCError({
				code: "INTERNAL_SERVER_ERROR",
				message: `Failed to fetch issue #${input.issueNumber}: ${err instanceof Error ? err.message : String(err)}`,
			});
		}
	});
