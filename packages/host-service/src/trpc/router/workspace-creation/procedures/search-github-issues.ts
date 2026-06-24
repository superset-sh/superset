import { TRPCError } from "@trpc/server";
import { GitHubProviderClient } from "../../../../runtime/repo-providers";
import { getProviderClient } from "../../../../runtime/repo-providers/registry";
import { protectedProcedure } from "../../../index";
import { githubSearchInputSchema } from "../schemas";
import { resolveRepo } from "../shared/project-helpers";

export const searchGitHubIssues = protectedProcedure
	.input(githubSearchInputSchema)
	.query(async ({ ctx, input }) => {
		const repo = await resolveRepo(ctx, input.projectId);
		if (repo.provider === "unknown") {
			// TODO(§8): self-managed hosts resolve to "unknown" until a capability
			// probe identifies the provider. Local-only repos have no issue search.
			throw new TRPCError({
				code: "BAD_REQUEST",
				message: `Repository at ${repo.repoPath} has no recognized provider for issue search.`,
			});
		}
		// For GitHub, construct a fresh client from the request-scoped execGh/github.
		// For other providers, use the registry.
		const client =
			repo.provider === "github"
				? new GitHubProviderClient({ execGh: ctx.execGh, github: ctx.github })
				: getProviderClient(repo.provider, repo.host);
		return client.searchIssues(
			{ owner: repo.owner, name: repo.name, repoPath: repo.repoPath },
			{
				text: input.query,
				includeClosed: input.includeClosed,
				page: input.page,
				limit: input.limit,
			},
		);
	});
