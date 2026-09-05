import { electronTrpcClient } from "renderer/lib/trpc-client";

const PREFIX = "router-history:";

/**
 * Which stored history keys belong to windows that no longer exist.
 *
 * Split out from the sweep so the rule is testable without localStorage or the
 * main process. The unprefixed "router-history" key is deliberately never
 * returned: it is the pre-multi-window record the first restored window still
 * inherits.
 */
export function selectStaleHistoryKeys(
	storedKeys: string[],
	liveWindowKeys: string[],
): string[] {
	const live = new Set(liveWindowKeys);
	return storedKeys.filter(
		(key) => key.startsWith(PREFIX) && !live.has(key.slice(PREFIX.length)),
	);
}

/**
 * Drop router history belonging to windows that no longer exist.
 *
 * Per-window history is keyed by the window's persisted key, and localStorage
 * has no owner to clean it up when a window is closed for good — without this,
 * every window ever opened leaves an entry behind on a store with a single
 * ~10 MB quota shared by the whole profile.
 *
 * Async and best-effort on purpose: it runs after boot, and a failure to reach
 * the main process just leaves the sweep for next launch rather than blocking
 * startup or throwing into it.
 */
export async function sweepDeadWindowHistories(): Promise<void> {
	try {
		const live = new Set(await electronTrpcClient.window.liveKeys.query());
		// Snapshot first: removeItem during a live key enumeration reindexes.
		const stored: string[] = [];
		for (let i = 0; i < localStorage.length; i++) {
			const key = localStorage.key(i);
			if (key) stored.push(key);
		}
		for (const key of selectStaleHistoryKeys(stored, [...live])) {
			localStorage.removeItem(key);
		}
	} catch (error) {
		console.warn(
			"[router-history] Failed to sweep dead window histories",
			error,
		);
	}
}
