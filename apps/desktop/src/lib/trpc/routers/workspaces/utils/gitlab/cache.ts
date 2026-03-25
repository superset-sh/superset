import type { GitHubStatus, PullRequestComment } from "@superset/local-db";
import {
	type CachedResourceReadOptions,
	type CacheState,
	createCachedResource,
} from "../github/cached-resource";
import type { GitLabRepoContext } from "./types";

const GITLAB_STATUS_CACHE_TTL_MS = 10_000;
const GITLAB_MR_COMMENTS_CACHE_TTL_MS = 30_000;
const GITLAB_REPO_CONTEXT_CACHE_TTL_MS = 300_000;

const MAX_GITLAB_STATUS_CACHE_ENTRIES = 256;
const MAX_GITLAB_MR_COMMENTS_CACHE_ENTRIES = 512;
const MAX_GITLAB_REPO_CONTEXT_CACHE_ENTRIES = 256;

const gitlabStatusResource = createCachedResource<GitHubStatus | null>({
	ttlMs: GITLAB_STATUS_CACHE_TTL_MS,
	maxEntries: MAX_GITLAB_STATUS_CACHE_ENTRIES,
});

const mrCommentsResource = createCachedResource<PullRequestComment[]>({
	ttlMs: GITLAB_MR_COMMENTS_CACHE_TTL_MS,
	maxEntries: MAX_GITLAB_MR_COMMENTS_CACHE_ENTRIES,
});

const repoContextResource = createCachedResource<GitLabRepoContext | null>({
	ttlMs: GITLAB_REPO_CONTEXT_CACHE_TTL_MS,
	maxEntries: MAX_GITLAB_REPO_CONTEXT_CACHE_ENTRIES,
});

export function readCachedGitLabStatus(
	worktreePath: string,
	load: () => Promise<GitHubStatus | null>,
	options?: CachedResourceReadOptions<GitHubStatus | null>,
): Promise<GitHubStatus | null> {
	return gitlabStatusResource.read(worktreePath, load, {
		...options,
		shouldCache: options?.shouldCache ?? ((value) => value !== null),
	});
}

export function makeMRCommentsCachePrefix(worktreePath: string): string {
	return `${worktreePath}::gitlab-comments::`;
}

export function makeMRCommentsCacheKey({
	worktreePath,
	projectPath,
	mrIid,
}: {
	worktreePath: string;
	projectPath: string;
	mrIid: number;
}): string {
	return `${makeMRCommentsCachePrefix(worktreePath)}${projectPath}#${mrIid}`;
}

export function getCachedMRCommentsState(
	cacheKey: string,
): CacheState<PullRequestComment[]> | null {
	return mrCommentsResource.getState(cacheKey);
}

export function readCachedMRComments(
	cacheKey: string,
	load: () => Promise<PullRequestComment[]>,
	options?: CachedResourceReadOptions<PullRequestComment[]>,
): Promise<PullRequestComment[]> {
	return mrCommentsResource.read(cacheKey, load, options);
}

export function readCachedRepoContext(
	worktreePath: string,
	load: () => Promise<GitLabRepoContext | null>,
	options?: CachedResourceReadOptions<GitLabRepoContext | null>,
): Promise<GitLabRepoContext | null> {
	return repoContextResource.read(worktreePath, load, {
		...options,
		shouldCache: options?.shouldCache ?? ((value) => value !== null),
	});
}

export function clearGitLabCachesForWorktree(worktreePath: string): void {
	gitlabStatusResource.invalidate(worktreePath);
	repoContextResource.invalidate(worktreePath);
	mrCommentsResource.invalidatePrefix(makeMRCommentsCachePrefix(worktreePath));
}
