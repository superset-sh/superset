const PREFIX = "router-history:";

/**
 * Which stored history keys belong to windows that no longer exist.
 *
 * Kept in its own module, free of the tRPC client the sweep needs, so the rule
 * is testable without localStorage or a live preload bridge. The unprefixed
 * "router-history" key is deliberately never returned: it is the
 * pre-multi-window record the first restored window still inherits.
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
