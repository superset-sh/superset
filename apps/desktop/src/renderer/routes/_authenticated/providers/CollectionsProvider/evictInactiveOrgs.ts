/**
 * Minimal shape of a TanStack DB collection needed for eviction: the supported
 * public `cleanup()` (stops sync + clears in-memory data). Kept dependency-free
 * so this module — and its tests — never pulls in Electric/persistence/`window`.
 */
export interface EvictableCollection {
	cleanup(): Promise<void>;
}

function isEvictable(value: unknown): value is EvictableCollection {
	return (
		typeof value === "object" &&
		value !== null &&
		typeof (value as { cleanup?: unknown }).cleanup === "function"
	);
}

/**
 * Evict every org in `cache` except `activeCacheKey`.
 *
 * For each inactive org: drop it from the cache, then `cleanup()` each of its
 * collections (stops Electric/localStorage sync and clears the in-memory rows).
 * Values without a `cleanup()` method are skipped, so the sweep stays safe even
 * if `OrgCollections` later gains a non-collection field. Cleanup runs
 * fire-and-forget because it tears sync down synchronously; the returned Promise
 * only settles bookkeeping. Rejections are routed to `onCleanupError` (with the
 * failing org key and collection name) so one bad collection never aborts the
 * sweep.
 *
 * On-disk SQLite/localStorage rows are intentionally left untouched so a later
 * switch back rehydrates cache-first (AGENTS.md §9). Removing the org from the
 * cache means `getCollections` rebuilds fresh instances on return, which keeps
 * rapid A→B→A switching recoverable and race-safe: the active org is never
 * evicted, and a re-entered org gets brand-new instances rather than a
 * half-disposed one.
 *
 * @returns the cache keys that were evicted.
 */
export function evictInactiveOrgs<T extends Record<string, unknown>>(
	cache: Map<string, T>,
	activeCacheKey: string,
	onCleanupError?: (
		orgKey: string,
		collectionName: string,
		error: unknown,
	) => void,
): string[] {
	const evicted: string[] = [];
	for (const [cacheKey, orgCollections] of cache) {
		if (cacheKey === activeCacheKey) continue;
		cache.delete(cacheKey);
		evicted.push(cacheKey);
		for (const [collectionName, collection] of Object.entries(orgCollections)) {
			if (!isEvictable(collection)) continue;
			void collection.cleanup().catch((error) => {
				onCleanupError?.(cacheKey, collectionName, error);
			});
		}
	}
	return evicted;
}
