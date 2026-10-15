import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure } from "../../../index";
import { execGh } from "../../workspace-creation/utils/exec-gh";
import { resolvePullRequestRepository } from "../resolve-repository";

const getDiffInputSchema = z.object({
	projectId: z.string(),
	prNumber: z.number().int().positive(),
});

// Mirrors get-content.ts's cache: the diff is immutable for a given push, but
// switching to the Code tab re-requests it often enough to burn the token
// bucket without one. Concurrent callers share the same in-flight promise.
const PULL_REQUEST_DIFF_CACHE_TTL_MS = 30_000;
const pullRequestDiffCache = new Map<
	string,
	{ promise: Promise<string>; fetchedAt: number }
>();

export const getDiff = protectedProcedure
	.input(getDiffInputSchema)
	.query(async ({ ctx, input }) => {
		const repo = await resolvePullRequestRepository(ctx, input.projectId);
		const cacheKey = `${repo.provider}/${repo.host}/${repo.repoPath}/${repo.owner}/${repo.name}#${input.prNumber}`;
		const cached = pullRequestDiffCache.get(cacheKey);
		if (
			cached &&
			Date.now() - cached.fetchedAt < PULL_REQUEST_DIFF_CACHE_TTL_MS
		) {
			return { patch: await cached.promise };
		}

		const fetchedAt = Date.now();
		const promise = (async (): Promise<string> => {
			try {
				if (repo.provider === "gitlab") {
					const raw = await ctx.execGlab(
						[
							"api",
							"--method",
							"GET",
							`projects/${encodeURIComponent(`${repo.owner}/${repo.name}`)}/merge_requests/${input.prNumber}/raw_diffs`,
						],
						{
							cwd: repo.repoPath,
							hostname: repo.host,
							timeout: 30_000,
							maxBuffer: 200 * 1024 * 1024,
						},
					);
					return typeof raw === "string" ? raw : "";
				}
				const raw = await execGh(
					[
						"pr",
						"diff",
						String(input.prNumber),
						"--repo",
						`${repo.owner}/${repo.name}`,
					],
					// Large diffs take longer than the 10s default; give gh room.
					// And a larger stdout cap: a PR touching generated single-line
					// files (locale catalogs, lockfiles) can produce a raw diff
					// well past execGh's 10MB default; the renderer already
					// lazy-hides oversized/generated files per-file.
					{ timeout: 30_000, maxBuffer: 200 * 1024 * 1024 },
				);
				// `gh pr diff` prints a raw unified diff, not JSON — execGh only
				// JSON-parses when it can, so this is already the plain string.
				return typeof raw === "string" ? raw : "";
			} catch (err) {
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: `Failed to fetch diff for PR #${input.prNumber}: ${err instanceof Error ? err.message : String(err)}`,
				});
			}
		})();
		// Evict on failure so the next caller retries instead of replaying the
		// same error for the rest of the TTL.
		promise.catch(() => {
			if (pullRequestDiffCache.get(cacheKey)?.promise === promise) {
				pullRequestDiffCache.delete(cacheKey);
			}
		});
		pullRequestDiffCache.set(cacheKey, { promise, fetchedAt });
		return { patch: await promise };
	});
