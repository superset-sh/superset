import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure } from "../../../index";
import { resolveGithubRepo } from "../shared/project-helpers";
import { execGh } from "../utils/exec-gh";

const getRepoContributorsInputSchema = z.object({
	projectId: z.string(),
});

const ghContributorSchema = z.object({
	login: z.string(),
	type: z.string().optional(),
});

export interface RepoContributor {
	login: string;
}

// The Author filter only needs a quick-pick list, not a complete roster —
// GitHub's contributors endpoint is sorted by commit count descending, so
// one page covers everyone anyone would actually look for.
const CONTRIBUTORS_PAGE_SIZE = 100;

// Browsing the filter popover re-opens this list repeatedly; the
// contributor set for a repo changes rarely, so cache it like
// getContent caches PR bodies.
const REPO_CONTRIBUTORS_CACHE_TTL_MS = 5 * 60_000;
const repoContributorsCache = new Map<
	string,
	{ promise: Promise<RepoContributor[]>; fetchedAt: number }
>();

export const getRepoContributors = protectedProcedure
	.input(getRepoContributorsInputSchema)
	.query(async ({ ctx, input }): Promise<RepoContributor[]> => {
		const repo = await resolveGithubRepo(ctx, input.projectId);
		const cacheKey = `${repo.owner.toLowerCase()}/${repo.name.toLowerCase()}`;
		const cached = repoContributorsCache.get(cacheKey);
		if (
			cached &&
			Date.now() - cached.fetchedAt < REPO_CONTRIBUTORS_CACHE_TTL_MS
		) {
			return cached.promise;
		}

		const fetchedAt = Date.now();
		const promise = (async (): Promise<RepoContributor[]> => {
			// gh-first uses the user's local `gh auth login`; falls back to
			// Octokit when gh is missing, unauthed, or errors.
			try {
				const raw = await execGh([
					"api",
					`repos/${repo.owner}/${repo.name}/contributors`,
					"-X",
					"GET",
					"-f",
					`per_page=${CONTRIBUTORS_PAGE_SIZE}`,
				]);
				// A repo with zero commits answers 204 No Content; execGh turns
				// an empty body into {}, not [], since it can't tell the two apart.
				const contributors = Array.isArray(raw)
					? z.array(ghContributorSchema).parse(raw)
					: [];
				return contributors
					.filter((c) => c.type !== "Bot")
					.map((c) => ({ login: c.login }));
			} catch (ghErr) {
				console.warn(
					"[workspaceCreation.getRepoContributors] gh path failed; falling back to Octokit",
					ghErr,
				);
			}

			try {
				const octokit = await ctx.github();
				const { data } = await octokit.repos.listContributors({
					owner: repo.owner,
					repo: repo.name,
					per_page: CONTRIBUTORS_PAGE_SIZE,
				});
				return data
					.filter((c) => c.type !== "Bot" && c.login)
					.map((c) => ({ login: c.login as string }));
			} catch (octokitErr) {
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: `Failed to fetch contributors for ${repo.owner}/${repo.name}: ${octokitErr instanceof Error ? octokitErr.message : String(octokitErr)}`,
				});
			}
		})();
		promise.catch(() => {
			if (repoContributorsCache.get(cacheKey)?.promise === promise) {
				repoContributorsCache.delete(cacheKey);
			}
		});
		repoContributorsCache.set(cacheKey, { promise, fetchedAt });
		return promise;
	});
