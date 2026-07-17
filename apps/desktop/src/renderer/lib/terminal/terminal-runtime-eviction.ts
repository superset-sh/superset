/**
 * Pure selection policy for parked-runtime LRU eviction (SUPER-1545).
 * Kept dependency-free so it can be unit-tested without pulling the
 * xterm/transport import graph into the test process.
 */

interface EvictionCandidate {
	runtime: { container: unknown } | null;
	lastUsedAt: number;
}

/** Returns null for values that must not change the cap (non-finite or < 1). */
export function normalizeParkedRuntimeCap(cap: number): number | null {
	if (!Number.isFinite(cap) || cap < 1) return null;
	return Math.floor(cap);
}

/**
 * Pick the parked (live runtime, no container) entries to release, oldest
 * `lastUsedAt` first, so at most `cap` parked runtimes remain. Attached
 * runtimes and runtime-less entries are never candidates.
 */
export function selectRuntimesToEvict<T extends EvictionCandidate>(
	entries: Iterable<T>,
	cap: number,
): T[] {
	const parked = Array.from(entries).filter(
		(entry) => entry.runtime !== null && entry.runtime.container === null,
	);
	if (parked.length <= cap) return [];
	parked.sort((a, b) => a.lastUsedAt - b.lastUsedAt);
	return parked.slice(0, parked.length - cap);
}
