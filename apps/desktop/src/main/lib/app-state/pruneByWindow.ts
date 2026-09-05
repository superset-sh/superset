/**
 * Keeps only the per-window entries whose window will be restored.
 *
 * Returns the original object when nothing is dropped, so an unchanged map does
 * not mark app-state dirty on every persist.
 */
export function pruneByWindow<T>(
	byWindow: Record<string, T> | undefined,
	live: Set<string>,
): Record<string, T> | undefined {
	if (!byWindow) return byWindow;
	const kept = Object.fromEntries(
		Object.entries(byWindow).filter(([key]) => live.has(key)),
	);
	return Object.keys(kept).length === Object.keys(byWindow).length
		? byWindow
		: kept;
}
