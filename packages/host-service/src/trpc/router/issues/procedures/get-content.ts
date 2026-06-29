import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { GitHubProviderClient } from "../../../../runtime/repo-providers/github/github-provider-client";
import { getProviderClient } from "../../../../runtime/repo-providers/registry";
import { protectedProcedure } from "../../../index";
import { resolveRepo } from "../../workspace-creation/shared/project-helpers";

const getContentInputSchema = z.object({
	projectId: z.string(),
	issueNumber: z.number().int().positive(),
});

// Shell out to the user's `gh` CLI rather than host-service's
// octokit — `gh auth login` works out of the box while the
// credential-manager path requires setup most users don't have.
export const getContent = protectedProcedure
	.input(getContentInputSchema)
	.query(async ({ ctx, input }) => {
		const repo = await resolveRepo(ctx, input.projectId);
		if (repo.provider === "unknown") {
			// TODO(§8): self-managed hosts resolve to "unknown" until a capability
			// probe identifies the provider. No issue content available for local-only repos.
			throw new TRPCError({
				code: "BAD_REQUEST",
				message: `Repository at ${repo.repoPath} has no recognized provider for issue content.`,
			});
		}
		// For GitHub, use a fresh request-scoped client (gh CLI + Octokit).
		// For other providers, route through the registry.
		const client =
			repo.provider === "github"
				? new GitHubProviderClient({ execGh: ctx.execGh, github: ctx.github })
				: getProviderClient(repo.provider, repo.host);
		try {
			return await client.fetchIssueContent(
				{ owner: repo.owner, name: repo.name },
				input.issueNumber,
			);
		} catch (err) {
			throw new TRPCError({
				code: "INTERNAL_SERVER_ERROR",
				message: `Failed to fetch issue #${input.issueNumber}: ${err instanceof Error ? err.message : String(err)}`,
			});
		}
	});
