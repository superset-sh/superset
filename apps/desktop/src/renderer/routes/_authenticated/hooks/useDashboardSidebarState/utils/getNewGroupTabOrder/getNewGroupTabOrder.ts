interface GroupSourcePosition {
	tabOrder: number;
	isGrouped: boolean;
}

/** Replace an ungrouped row's slot, or insert just after its existing group. */
export function getNewGroupTabOrder(
	sources: GroupSourcePosition[],
	topLevelOrders: number[],
	fallback: number,
): number {
	const first = sources.reduce<GroupSourcePosition | undefined>(
		(earliest, source) =>
			!earliest || source.tabOrder < earliest.tabOrder ? source : earliest,
		undefined,
	);
	if (!first) return fallback;
	if (!first.isGrouped) return first.tabOrder;
	const next = Math.min(
		...topLevelOrders.filter((order) => order > first.tabOrder),
	);
	return Number.isFinite(next)
		? first.tabOrder + (next - first.tabOrder) / 2
		: first.tabOrder + 1;
}
