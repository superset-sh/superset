// Browsing the PR list re-opens the detail panel constantly; the `gh pr view`
// response is held for a short TTL so repeat clicks don't burn the user's
// GitHub token bucket.
const PULL_REQUEST_CONTENT_CACHE_TTL_MS = 30_000;

interface CacheEntry {
	promise: Promise<unknown>;
	fetchedAt: number;
}

const entries = new Map<string, CacheEntry>();

interface RepoIdentity {
	owner: string;
	name: string;
}

function isExpired(entry: CacheEntry, now: number): boolean {
	return now - entry.fetchedAt >= PULL_REQUEST_CONTENT_CACHE_TTL_MS;
}

export function pullRequestContentCacheKey(
	repo: RepoIdentity,
	prNumber: number,
): string {
	return `${repo.owner.toLowerCase()}/${repo.name.toLowerCase()}#${prNumber}`;
}

export function readPullRequestContentCache<T>(key: string): Promise<T> | null {
	const cached = entries.get(key);
	if (!cached) return null;
	if (isExpired(cached, Date.now())) {
		entries.delete(key);
		return null;
	}
	return cached.promise as Promise<T>;
}

/**
 * Concurrent callers share the in-flight promise. A rejection evicts its own
 * entry so the next caller retries instead of replaying the error for the
 * rest of the TTL. Expired entries are swept on every write, so the map only
 * ever holds the PRs opened within the last TTL.
 */
export function writePullRequestContentCache<T>(
	key: string,
	promise: Promise<T>,
): void {
	const now = Date.now();
	for (const [otherKey, entry] of entries) {
		if (isExpired(entry, now)) entries.delete(otherKey);
	}
	entries.set(key, { promise, fetchedAt: now });
	promise.catch(() => {
		if (entries.get(key)?.promise === promise) {
			entries.delete(key);
		}
	});
}

/**
 * For writes the host made itself (merge, close, reopen): the cached
 * `gh pr view` would otherwise answer the caller's refetch with the pre-write
 * state for the rest of the TTL.
 */
export function evictPullRequestContent(
	repo: RepoIdentity,
	prNumber: number,
): void {
	entries.delete(pullRequestContentCacheKey(repo, prNumber));
}

/** Test-only: the number of live entries, for asserting the sweep. */
export function pullRequestContentCacheSize(): number {
	return entries.size;
}
