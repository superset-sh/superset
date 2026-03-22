import type { GitHubStatus, PullRequestComment } from "@superset/local-db";
import type { RepoContext } from "./types";

const GITHUB_STATUS_CACHE_TTL_MS = 10_000;
const GITHUB_PR_COMMENTS_CACHE_TTL_MS = 30_000;
const GITHUB_REPO_CONTEXT_CACHE_TTL_MS = 300_000;

const MAX_GITHUB_STATUS_CACHE_ENTRIES = 256;
const MAX_GITHUB_PR_COMMENTS_CACHE_ENTRIES = 512;
const MAX_GITHUB_REPO_CONTEXT_CACHE_ENTRIES = 256;

interface CacheEntry<T> {
	value: T;
	expiresAt: number;
}

const githubStatusCache = new Map<string, CacheEntry<GitHubStatus>>();
const githubStatusInFlight = new Map<string, Promise<GitHubStatus | null>>();

const pullRequestCommentsCache = new Map<
	string,
	CacheEntry<PullRequestComment[]>
>();
const pullRequestCommentsInFlight = new Map<
	string,
	Promise<PullRequestComment[]>
>();

const repoContextCache = new Map<string, CacheEntry<RepoContext>>();
const repoContextInFlight = new Map<string, Promise<RepoContext | null>>();

function getCachedValue<T>(
	cache: Map<string, CacheEntry<T>>,
	cacheKey: string,
): T | null {
	const cached = cache.get(cacheKey);
	if (!cached) {
		return null;
	}

	if (cached.expiresAt <= Date.now()) {
		cache.delete(cacheKey);
		return null;
	}

	return cached.value;
}

function setCachedValue<T>(
	cache: Map<string, CacheEntry<T>>,
	cacheKey: string,
	value: T,
	ttlMs: number,
	maxEntries: number,
): void {
	if (!cache.has(cacheKey) && cache.size >= maxEntries) {
		cache.clear();
	}

	cache.set(cacheKey, {
		value,
		expiresAt: Date.now() + ttlMs,
	});
}

function clearEntriesWithPrefix<T>(
	cache: Map<string, T>,
	cacheKeyPrefix: string,
): void {
	for (const cacheKey of cache.keys()) {
		if (cacheKey.startsWith(cacheKeyPrefix)) {
			cache.delete(cacheKey);
		}
	}
}

export function getCachedGitHubStatus(
	worktreePath: string,
): GitHubStatus | null {
	return getCachedValue(githubStatusCache, worktreePath);
}

export function setCachedGitHubStatus(
	worktreePath: string,
	value: GitHubStatus,
): void {
	setCachedValue(
		githubStatusCache,
		worktreePath,
		value,
		GITHUB_STATUS_CACHE_TTL_MS,
		MAX_GITHUB_STATUS_CACHE_ENTRIES,
	);
}

export function getInFlightGitHubStatus(
	worktreePath: string,
): Promise<GitHubStatus | null> | null {
	return githubStatusInFlight.get(worktreePath) ?? null;
}

export function setInFlightGitHubStatus(
	worktreePath: string,
	promise: Promise<GitHubStatus | null>,
): void {
	githubStatusInFlight.set(worktreePath, promise);
}

export function clearInFlightGitHubStatus(worktreePath: string): void {
	githubStatusInFlight.delete(worktreePath);
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
	return getCachedValue(pullRequestCommentsCache, cacheKey);
}

export function setCachedPullRequestComments(
	cacheKey: string,
	value: PullRequestComment[],
): void {
	setCachedValue(
		pullRequestCommentsCache,
		cacheKey,
		value,
		GITHUB_PR_COMMENTS_CACHE_TTL_MS,
		MAX_GITHUB_PR_COMMENTS_CACHE_ENTRIES,
	);
}

export function getInFlightPullRequestComments(
	cacheKey: string,
): Promise<PullRequestComment[]> | null {
	return pullRequestCommentsInFlight.get(cacheKey) ?? null;
}

export function setInFlightPullRequestComments(
	cacheKey: string,
	promise: Promise<PullRequestComment[]>,
): void {
	pullRequestCommentsInFlight.set(cacheKey, promise);
}

export function clearInFlightPullRequestComments(cacheKey: string): void {
	pullRequestCommentsInFlight.delete(cacheKey);
}

export function getCachedRepoContext(worktreePath: string): RepoContext | null {
	return getCachedValue(repoContextCache, worktreePath);
}

export function setCachedRepoContext(
	worktreePath: string,
	value: RepoContext,
): void {
	setCachedValue(
		repoContextCache,
		worktreePath,
		value,
		GITHUB_REPO_CONTEXT_CACHE_TTL_MS,
		MAX_GITHUB_REPO_CONTEXT_CACHE_ENTRIES,
	);
}

export function getInFlightRepoContext(
	worktreePath: string,
): Promise<RepoContext | null> | null {
	return repoContextInFlight.get(worktreePath) ?? null;
}

export function setInFlightRepoContext(
	worktreePath: string,
	promise: Promise<RepoContext | null>,
): void {
	repoContextInFlight.set(worktreePath, promise);
}

export function clearInFlightRepoContext(worktreePath: string): void {
	repoContextInFlight.delete(worktreePath);
}

export function clearGitHubCachesForWorktree(worktreePath: string): void {
	githubStatusCache.delete(worktreePath);
	githubStatusInFlight.delete(worktreePath);
	repoContextCache.delete(worktreePath);
	repoContextInFlight.delete(worktreePath);

	const commentsCachePrefix = makePullRequestCommentsCachePrefix(worktreePath);
	clearEntriesWithPrefix(pullRequestCommentsCache, commentsCachePrefix);
	clearEntriesWithPrefix(pullRequestCommentsInFlight, commentsCachePrefix);
}
