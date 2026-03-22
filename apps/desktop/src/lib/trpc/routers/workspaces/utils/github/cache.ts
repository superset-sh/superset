import type { GitHubStatus, PullRequestComment } from "@superset/local-db";
import {
	type CachedResourceReadOptions,
	type CacheState,
	createCachedResource,
} from "./cached-resource";
import type { RepoContext } from "./types";

const GITHUB_STATUS_CACHE_TTL_MS = 10_000;
const GITHUB_PR_COMMENTS_CACHE_TTL_MS = 30_000;
const GITHUB_REPO_CONTEXT_CACHE_TTL_MS = 300_000;

const MAX_GITHUB_STATUS_CACHE_ENTRIES = 256;
const MAX_GITHUB_PR_COMMENTS_CACHE_ENTRIES = 512;
const MAX_GITHUB_REPO_CONTEXT_CACHE_ENTRIES = 256;

const githubStatusResource = createCachedResource<GitHubStatus | null>({
	ttlMs: GITHUB_STATUS_CACHE_TTL_MS,
	maxEntries: MAX_GITHUB_STATUS_CACHE_ENTRIES,
});

const pullRequestCommentsResource = createCachedResource<PullRequestComment[]>({
	ttlMs: GITHUB_PR_COMMENTS_CACHE_TTL_MS,
	maxEntries: MAX_GITHUB_PR_COMMENTS_CACHE_ENTRIES,
});

const repoContextResource = createCachedResource<RepoContext | null>({
	ttlMs: GITHUB_REPO_CONTEXT_CACHE_TTL_MS,
	maxEntries: MAX_GITHUB_REPO_CONTEXT_CACHE_ENTRIES,
});

export function getCachedGitHubStatus(
	worktreePath: string,
): GitHubStatus | null {
	return githubStatusResource.get(worktreePath);
}

export function getCachedGitHubStatusState(
	worktreePath: string,
): CacheState<GitHubStatus | null> | null {
	return githubStatusResource.getState(worktreePath);
}

export function setCachedGitHubStatus(
	worktreePath: string,
	value: GitHubStatus,
): void {
	githubStatusResource.set(worktreePath, value);
}

export function readCachedGitHubStatus(
	worktreePath: string,
	load: () => Promise<GitHubStatus | null>,
	options?: CachedResourceReadOptions<GitHubStatus | null>,
): Promise<GitHubStatus | null> {
	return githubStatusResource.read(worktreePath, load, {
		...options,
		shouldCache: options?.shouldCache ?? ((value) => value !== null),
	});
}

export function makePullRequestCommentsCachePrefix(
	worktreePath: string,
): string {
	return `${worktreePath}::comments::`;
}

export function makePullRequestCommentsCacheKey({
	worktreePath,
	repoNameWithOwner,
	pullRequestNumber,
}: {
	worktreePath: string;
	repoNameWithOwner: string;
	pullRequestNumber: number;
}): string {
	return `${makePullRequestCommentsCachePrefix(worktreePath)}${repoNameWithOwner}#${pullRequestNumber}`;
}

export function getCachedPullRequestComments(
	cacheKey: string,
): PullRequestComment[] | null {
	return pullRequestCommentsResource.get(cacheKey);
}

export function getCachedPullRequestCommentsState(
	cacheKey: string,
): CacheState<PullRequestComment[]> | null {
	return pullRequestCommentsResource.getState(cacheKey);
}

export function setCachedPullRequestComments(
	cacheKey: string,
	value: PullRequestComment[],
): void {
	pullRequestCommentsResource.set(cacheKey, value);
}

export function readCachedPullRequestComments(
	cacheKey: string,
	load: () => Promise<PullRequestComment[]>,
	options?: CachedResourceReadOptions<PullRequestComment[]>,
): Promise<PullRequestComment[]> {
	return pullRequestCommentsResource.read(cacheKey, load, options);
}

export function getCachedRepoContext(worktreePath: string): RepoContext | null {
	return repoContextResource.get(worktreePath);
}

export function getCachedRepoContextState(
	worktreePath: string,
): CacheState<RepoContext | null> | null {
	return repoContextResource.getState(worktreePath);
}

export function setCachedRepoContext(
	worktreePath: string,
	value: RepoContext,
): void {
	repoContextResource.set(worktreePath, value);
}

export function readCachedRepoContext(
	worktreePath: string,
	load: () => Promise<RepoContext | null>,
	options?: CachedResourceReadOptions<RepoContext | null>,
): Promise<RepoContext | null> {
	return repoContextResource.read(worktreePath, load, {
		...options,
		shouldCache: options?.shouldCache ?? ((value) => value !== null),
	});
}

export function clearGitHubCachesForWorktree(worktreePath: string): void {
	githubStatusResource.invalidate(worktreePath);
	repoContextResource.invalidate(worktreePath);
	pullRequestCommentsResource.invalidatePrefix(
		makePullRequestCommentsCachePrefix(worktreePath),
	);
}
