/**
 * Given an ordered list of workspace IDs, a current ID, and a filter set,
 * return the neighboring ID that belongs to the filter set.
 *
 * - `currentId` does not need to be in `filter` — the search starts from its
 *   position in `ordered` and walks outward.
 * - The current ID is always skipped, even if it is in `filter`.
 * - Wraps around the ends of `ordered`.
 * - Returns `null` if no other member of `filter` exists in `ordered`.
 */
export function findNeighborInSet(
	ordered: string[],
	currentId: string,
	filter: Set<string>,
	direction: "next" | "prev",
): string | null {
	if (ordered.length === 0) return null;

	const currentIndex = ordered.indexOf(currentId);
	if (currentIndex === -1) return null;

	const step = direction === "next" ? 1 : -1;
	const len = ordered.length;

	for (let offset = 1; offset < len; offset++) {
		const idx = (currentIndex + step * offset + len * len) % len;
		const candidate = ordered[idx];
		if (candidate && candidate !== currentId && filter.has(candidate)) {
			return candidate;
		}
	}

	return null;
}
