/**
 * Pure selection policy for parked-runtime LRU eviction (SUPER-1545).
 * Kept dependency-free so it can be unit-tested without pulling the
 * xterm/transport import graph into the test process. Also reused by the
 * browser pane registry for hidden-webview eviction.
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
 * runtimes and runtime-less entries are never candidates. Exempt entries
 * (e.g. an active alternate-screen TUI) still occupy the parked count but
 * are never selected — eviction stops early when only exempt entries remain.
 */
export function selectRuntimesToEvict<T extends EvictionCandidate>(
	entries: Iterable<T>,
	cap: number,
	isExempt: (entry: T) => boolean = () => false,
): T[] {
	const parked = Array.from(entries).filter(
		(entry) => entry.runtime !== null && entry.runtime.container === null,
	);
	const excess = parked.length - cap;
	if (excess <= 0) return [];
	const evictable = parked.filter((entry) => !isExempt(entry));
	evictable.sort((a, b) => a.lastUsedAt - b.lastUsedAt);
	return evictable.slice(0, excess);
}
