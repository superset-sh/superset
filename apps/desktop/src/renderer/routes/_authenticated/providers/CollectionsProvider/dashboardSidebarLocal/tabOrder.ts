/**
 * Lower tabOrder = appears earlier in the sidebar (queries sort ASC).
 * Prepending therefore picks one less than the smallest existing tabOrder
 * so the new item lands at the top regardless of whether existing items
 * are positive (newly defaulted) or negative (after prior prepends).
 */
export function getPrependTabOrder(items: Array<{ tabOrder: number }>): number {
	if (items.length === 0) return 1;
	const minTabOrder = items.reduce(
		(minValue, item) => Math.min(minValue, item.tabOrder),
		Number.POSITIVE_INFINITY,
	);
	return minTabOrder - 1;
}

export function getNextTabOrder(items: Array<{ tabOrder: number }>): number {
	const maxTabOrder = items.reduce(
		(maxValue, item) => Math.max(maxValue, item.tabOrder),
		0,
	);
	return maxTabOrder + 1;
}
