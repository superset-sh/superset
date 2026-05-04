import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure } from "../../../index";
import { resolveGithubRepo } from "../../workspace-creation/shared/project-helpers";
import { execGh } from "../../workspace-creation/utils/exec-gh";

const getContentInputSchema = z.object({
	projectId: z.string(),
	prNumber: z.number().int().positive(),
});

const ghPullRequestContentSchema = z.object({
	number: z.number(),
	title: z.string(),
	body: z.string().nullable().optional(),
	url: z.string(),
	state: z.string(),
	headRefName: z.string(),
	baseRefName: z.string(),
	headRepositoryOwner: z.object({ login: z.string() }).nullable(),
	isCrossRepository: z.boolean(),
	isDraft: z.boolean(),
	author: z.object({ login: z.string() }).optional(),
	createdAt: z.string().optional(),
	updatedAt: z.string().optional(),
});

type PullRequestContent = {
	number: number;
	title: string;
	body: string;
	url: string;
	state: string;
	branch: string;
	baseBranch: string;
	headRepositoryOwner: string | null;
	isCrossRepository: boolean;
	author: string | null;
	isDraft: boolean;
	createdAt: string | undefined;
	updatedAt: string | undefined;
};

// Browsing the PR list re-opens the detail panel constantly; cache the
// `gh pr view` response so we don't burn the user's GitHub token bucket on
// repeat clicks. Concurrent callers share the same in-flight promise.
const PULL_REQUEST_CONTENT_CACHE_TTL_MS = 30_000;
const pullRequestContentCache = new Map<
	string,
	{ promise: Promise<PullRequestContent>; fetchedAt: number }
>();

export const getContent = protectedProcedure
	.input(getContentInputSchema)
	.query(async ({ ctx, input }) => {
		const repo = await resolveGithubRepo(ctx, input.projectId);
		const cacheKey = `${repo.owner.toLowerCase()}/${repo.name.toLowerCase()}#${input.prNumber}`;
		const cached = pullRequestContentCache.get(cacheKey);
		if (
			cached &&
			Date.now() - cached.fetchedAt < PULL_REQUEST_CONTENT_CACHE_TTL_MS
		) {
			return cached.promise;
		}

		const fetchedAt = Date.now();
		const promise = (async (): Promise<PullRequestContent> => {
			try {
				const raw = await execGh([
					"pr",
					"view",
					String(input.prNumber),
					"--repo",
					`${repo.owner}/${repo.name}`,
					"--json",
					"number,title,body,url,state,author,headRefName,baseRefName,headRepositoryOwner,isCrossRepository,isDraft,createdAt,updatedAt",
				]);
				const data = ghPullRequestContentSchema.parse(raw);
				return {
					number: data.number,
					title: data.title,
					body: data.body ?? "",
					url: data.url,
					state: data.state.toLowerCase(),
					branch: data.headRefName,
					baseBranch: data.baseRefName,
					headRepositoryOwner: data.headRepositoryOwner?.login ?? null,
					isCrossRepository: data.isCrossRepository,
					author: data.author?.login ?? null,
					isDraft: data.isDraft,
					createdAt: data.createdAt,
					updatedAt: data.updatedAt,
				};
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
