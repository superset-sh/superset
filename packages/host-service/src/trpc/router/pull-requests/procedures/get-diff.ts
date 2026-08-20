import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure } from "../../../index";
import { resolveGithubRepo } from "../../workspace-creation/shared/project-helpers";
import { execGh } from "../../workspace-creation/utils/exec-gh";

const getDiffInputSchema = z.object({
	projectId: z.string(),
	prNumber: z.number().int().positive(),
});

// Mirrors get-content.ts's cache: the diff is immutable for a given push, but
// browsing the PR list re-opens the Code tab often enough to burn the token
// bucket without one. Concurrent callers share the same in-flight promise.
const PULL_REQUEST_DIFF_CACHE_TTL_MS = 30_000;
const pullRequestDiffCache = new Map<
	string,
	{ promise: Promise<string>; fetchedAt: number }
>();

export const getDiff = protectedProcedure
	.input(getDiffInputSchema)
	.query(async ({ ctx, input }) => {
		const repo = await resolveGithubRepo(ctx, input.projectId);
		const cacheKey = `${repo.owner.toLowerCase()}/${repo.name.toLowerCase()}#${input.prNumber}`;
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
				const raw = await execGh([
					"pr",
					"diff",
					String(input.prNumber),
					"--repo",
					`${repo.owner}/${repo.name}`,
				]);
				// gh pr diff prints a raw unified diff, not JSON — execGh only
				// JSON-parses when it can, so this is already the plain string.
				return typeof raw === "string" ? raw : "";
			} catch (err) {
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: `Failed to fetch diff for PR #${input.prNumber}: ${err instanceof Error ? err.message : String(err)}`,
				});
			}
		})();
		promise.catch(() => {
			if (pullRequestDiffCache.get(cacheKey)?.promise === promise) {
				pullRequestDiffCache.delete(cacheKey);
			}
		});
		pullRequestDiffCache.set(cacheKey, { promise, fetchedAt });
		return { patch: await promise };
	});
