import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { GitHubProviderClient } from "../../../../runtime/repo-providers/github/github-provider-client";
import { getProviderClient } from "../../../../runtime/repo-providers/registry";
import type { NormalizedPullRequestContent } from "../../../../runtime/repo-providers/types";
import { protectedProcedure } from "../../../index";
import { resolveRepo } from "../../workspace-creation/shared/project-helpers";

const getContentInputSchema = z.object({
	projectId: z.string(),
	prNumber: z.number().int().positive(),
});

// Browsing the PR list re-opens the detail panel constantly; cache the
// `gh pr view` response so we don't burn the user's GitHub token bucket on
// repeat clicks. Concurrent callers share the same in-flight promise.
const PULL_REQUEST_CONTENT_CACHE_TTL_MS = 30_000;
const pullRequestContentCache = new Map<
	string,
	{ promise: Promise<NormalizedPullRequestContent>; fetchedAt: number }
>();

export const getContent = protectedProcedure
	.input(getContentInputSchema)
	.query(async ({ ctx, input }) => {
		const repo = await resolveRepo(ctx, input.projectId);
		// Include host in the cache key to avoid slug collisions across providers.
		const cacheKey = `${repo.host}/${repo.owner.toLowerCase()}/${repo.name.toLowerCase()}#${input.prNumber}`;
		const cached = pullRequestContentCache.get(cacheKey);
		if (
			cached &&
			Date.now() - cached.fetchedAt < PULL_REQUEST_CONTENT_CACHE_TTL_MS
		) {
			return cached.promise;
		}

		if (repo.provider === "unknown") {
			// TODO(§8): self-managed hosts resolve to "unknown" until a capability
			// probe identifies the provider. No PR content available for local-only repos.
			throw new TRPCError({
				code: "BAD_REQUEST",
				message: `Repository at ${repo.repoPath} has no recognized provider for pull request content.`,
			});
		}

		const fetchedAt = Date.now();
		// For GitHub, use a fresh request-scoped client (gh CLI + Octokit).
		// For other providers, route through the registry.
		const client =
			repo.provider === "github"
				? new GitHubProviderClient({ execGh: ctx.execGh, github: ctx.github })
				: getProviderClient(repo.provider, repo.host);
		const promise = (async () => {
			try {
				return await client.fetchPullRequestContent(
					{ owner: repo.owner, name: repo.name },
					input.prNumber,
				);
			} catch (err) {
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: `Failed to fetch PR #${input.prNumber}: ${err instanceof Error ? err.message : String(err)}`,
				});
			}
		})();
		// Evict on failure so the next caller retries instead of replaying the
		// same error for the rest of the TTL.
		promise.catch(() => {
			if (pullRequestContentCache.get(cacheKey)?.promise === promise) {
				pullRequestContentCache.delete(cacheKey);
			}
		});
		pullRequestContentCache.set(cacheKey, { promise, fetchedAt });
		return promise;
	});
