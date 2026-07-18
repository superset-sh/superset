/**
 * Lower tabOrder = appears earlier in the sidebar (queries sort ASC).
 */
export function getNextTabOrder(items: Array<{ tabOrder: number }>): number {
	const maxTabOrder = items.reduce(
		(maxValue, item) => Math.max(maxValue, item.tabOrder),
		0,
	);
	return maxTabOrder + 1;
}
