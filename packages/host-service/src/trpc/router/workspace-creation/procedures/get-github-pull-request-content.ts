import { TRPCError } from "@trpc/server";
import { protectedProcedure } from "../../../index";
import {
	githubPullRequestContentInputSchema,
	pullRequestContentSchema,
} from "../schemas";
import { resolveGithubRepo } from "../shared/project-helpers";
import { execGh } from "../utils/exec-gh";

type PullRequestContent = {
	number: number;
	title: string;
	body: string;
	url: string;
	state: string;
	branch: string;
	headRefOid: string;
	baseBranch: string;
	headRepositoryOwner: string | null;
	headRepositoryName: string | null;
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

export const getGitHubPullRequestContent = protectedProcedure
	.input(githubPullRequestContentInputSchema)
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
					"number,title,body,url,state,author,headRefName,headRefOid,baseRefName,headRepositoryOwner,headRepository,isCrossRepository,isDraft,createdAt,updatedAt",
				]);
				const data = pullRequestContentSchema.parse(raw);
				return {
					number: data.number,
					title: data.title,
					body: data.body ?? "",
					url: data.url,
					state: data.state.toLowerCase(),
					branch: data.headRefName,
					headRefOid: data.headRefOid,
					baseBranch: data.baseRefName,
					headRepositoryOwner: data.headRepositoryOwner?.login ?? null,
					headRepositoryName: data.headRepository?.name ?? null,
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
