/**
 * Reorders items in an array by moving the item at `fromIndex` to `toIndex`,
 * then assigns sequential indices (0, 1, 2, ...) to each item's `tabOrder`.
 *
 * Mutates and returns the input array.
 */
export function reorderItems<T extends { tabOrder: number }>(
	items: T[],
	fromIndex: number,
	toIndex: number,
): T[] {
	if (items.length === 0) {
		throw new Error("Cannot reorder an empty array");
	}
	if (
		fromIndex < 0 ||
		fromIndex >= items.length ||
		toIndex < 0 ||
		toIndex >= items.length
	) {
		throw new Error("Invalid fromIndex or toIndex");
	}

	const [removed] = items.splice(fromIndex, 1);
	items.splice(toIndex, 0, removed);

	for (let i = 0; i < items.length; i++) {
		items[i].tabOrder = i;
	}

	return items;
}

/**
 * Computes the next tabOrder value for a new item given existing tabOrders.
 * Returns 0 for an empty list, or max(existing) + 1 otherwise.
 */
export function computeNextTabOrder(existingTabOrders: number[]): number {
	if (existingTabOrders.length === 0) return 0;
	return Math.max(...existingTabOrders) + 1;
}
