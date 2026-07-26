// Sidebar ordering primitives shared by host-service, CLI, and desktop.
// Lower tabOrder = earlier (ASC).

export interface TabOrdered {
	tabOrder: number;
}

export interface TopLevelItem extends TabOrdered {
	type: "workspace" | "section";
	id: string;
}

export function getPrependTabOrder(items: TabOrdered[]): number {
	if (items.length === 0) return 1;
	const minTabOrder = items.reduce(
		(minValue, item) => Math.min(minValue, item.tabOrder),
		Number.POSITIVE_INFINITY,
	);
	return minTabOrder - 1;
}

export function getNextTabOrder(items: TabOrdered[]): number {
	// Seed with -Infinity, not 0, so an all-negative lane appends after its max.
	if (items.length === 0) return 1;
	const maxTabOrder = items.reduce(
		(maxValue, item) => Math.max(maxValue, item.tabOrder),
		Number.NEGATIVE_INFINITY,
	);
	return maxTabOrder + 1;
}

/** tabOrder ASC; sections sort before workspaces on ties. */
export function compareTopLevelItems(
	left: TopLevelItem,
	right: TopLevelItem,
): number {
	const orderDelta = left.tabOrder - right.tabOrder;
	if (orderDelta !== 0) return orderDelta;
	if (left.type === right.type) return 0;
	return left.type === "section" ? -1 : 1;
}

export function getFirstSectionIndex(
	items: Array<Pick<TopLevelItem, "type">>,
): number {
	const firstSectionIndex = items.findIndex((item) => item.type === "section");
	return firstSectionIndex === -1 ? items.length : firstSectionIndex;
}
