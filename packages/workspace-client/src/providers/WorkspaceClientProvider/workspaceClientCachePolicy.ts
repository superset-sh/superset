export const MAX_WORKSPACE_CLIENT_CACHE_ENTRIES = 8;
export const WORKSPACE_CLIENT_IDLE_DISPOSE_MS = 60_000;

export interface WorkspaceClientCachePolicyEntry {
	key: string;
	activeRefs: number;
	lastAccessedAt: number;
}

export function getIdleWorkspaceClientEvictionKeys(
	entries: readonly WorkspaceClientCachePolicyEntry[],
	maxEntries = MAX_WORKSPACE_CLIENT_CACHE_ENTRIES,
	protectedKey?: string,
): string[] {
	if (entries.length <= maxEntries) return [];

	const idleEntries = entries
		.filter((entry) => entry.activeRefs === 0 && entry.key !== protectedKey)
		.sort((left, right) => left.lastAccessedAt - right.lastAccessedAt);
	const evictionCount = entries.length - maxEntries;
	return idleEntries.slice(0, evictionCount).map((entry) => entry.key);
}
