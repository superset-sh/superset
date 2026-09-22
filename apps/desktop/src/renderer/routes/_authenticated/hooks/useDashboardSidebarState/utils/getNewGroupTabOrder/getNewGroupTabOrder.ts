interface GroupSourcePosition {
	tabOrder: number;
	isGrouped: boolean;
}

/**
 * Replace an ungrouped row's slot, or take the one right after its existing
 * group. Every lane order is an integer — the schema rejects anything else —
 * so the new group shares a slot with whatever holds it until the next
 * reorder renumbers the lane.
 */
export function getNewGroupTabOrder(
	sources: GroupSourcePosition[],
	fallback: number,
): number {
	const first = sources.reduce<GroupSourcePosition | undefined>(
		(earliest, source) =>
			!earliest || source.tabOrder < earliest.tabOrder ? source : earliest,
		undefined,
	);
	if (!first) return fallback;
	return first.isGrouped ? first.tabOrder + 1 : first.tabOrder;
}
