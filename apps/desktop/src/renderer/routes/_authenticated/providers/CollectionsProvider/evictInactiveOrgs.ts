/**
 * Minimal shape of a TanStack DB collection needed for eviction: the supported
 * public `cleanup()` (stops sync + clears in-memory data). Kept dependency-free
 * so this module — and its tests — never pulls in Electric/persistence/`window`.
 */
export interface EvictableCollection {
	cleanup(): Promise<void>;
}

/**
 * Evict every org in `cache` except `activeCacheKey`.
 *
 * For each inactive org: drop it from the cache, then `cleanup()` each of its
 * collections (stops Electric/localStorage sync and clears the in-memory rows).
 * Cleanup runs fire-and-forget because it tears sync down synchronously; the
 * returned Promise only settles bookkeeping. Rejections are routed to
 * `onCleanupError` so one bad collection never aborts the sweep.
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
export function evictInactiveOrgs(
	cache: Map<string, Record<string, EvictableCollection>>,
	activeCacheKey: string,
	onCleanupError?: (orgKey: string, error: unknown) => void,
): string[] {
	const evicted: string[] = [];
	for (const [cacheKey, orgCollections] of cache) {
		if (cacheKey === activeCacheKey) continue;
		cache.delete(cacheKey);
		evicted.push(cacheKey);
		for (const collection of Object.values(orgCollections)) {
			void collection.cleanup().catch((error) => {
				onCleanupError?.(cacheKey, error);
			});
		}
	}
	return evicted;
}
