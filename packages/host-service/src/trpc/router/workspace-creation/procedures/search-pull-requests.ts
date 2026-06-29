import { TRPCError } from "@trpc/server";
import { GitHubProviderClient } from "../../../../runtime/repo-providers";
import { getProviderClient } from "../../../../runtime/repo-providers/registry";
import { protectedProcedure } from "../../../index";
import { githubSearchInputSchema } from "../schemas";
import { resolveRepo } from "../shared/project-helpers";

export const searchPullRequests = protectedProcedure
	.input(githubSearchInputSchema)
	.query(async ({ ctx, input }) => {
		const repo = await resolveRepo(ctx, input.projectId);
		if (repo.provider === "unknown") {
			// TODO(§8): self-managed hosts resolve to "unknown" until a capability
			// probe identifies the provider. Local-only repos have no PR search.
			throw new TRPCError({
				code: "BAD_REQUEST",
				message: `Repository at ${repo.repoPath} has no recognized provider for pull request search.`,
			});
		}
		// For GitHub, construct a fresh client from the request-scoped execGh/github
		// so the gh CLI runs with the right cwd/auth. For other providers, use the
		// registry (registered at startup with provider-specific credentials).
		const client =
			repo.provider === "github"
				? new GitHubProviderClient({ execGh: ctx.execGh, github: ctx.github })
				: getProviderClient(repo.provider, repo.host);
		return client.searchPullRequests(
			{ owner: repo.owner, name: repo.name, repoPath: repo.repoPath },
			{
				text: input.query,
				includeClosed: input.includeClosed,
				page: input.page,
				limit: input.limit,
			},
		);
	});
