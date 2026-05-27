export interface TabDragHoverArgs {
	itemTabId: string;
	itemIndex: number | undefined;
	hoveredTabId: string;
	hoveredIndex: number;
	isHoveredActive: boolean;
}

export interface TabDragHoverActions {
	reorder?: { fromIndex: number; toIndex: number };
	activate: boolean;
}

// Spring-loaded tab activation during drag: hovering over a tab in the strip
// should switch it to be the active tab so its panes' Mosaic split drop zones
// become visible — that's the only way to drop a dragged tab onto another
// tab's layout to merge them.
// Why this is a function: the React drag hover handler lives inside a
// react-dnd spec closure, which is hard to unit test directly.
// Refs: https://github.com/superset-sh/superset/issues/4958
export function computeTabDragHoverActions({
	itemTabId,
	itemIndex,
	hoveredTabId,
	hoveredIndex,
	isHoveredActive,
}: TabDragHoverArgs): TabDragHoverActions {
	const reorder =
		itemIndex !== undefined && itemIndex !== hoveredIndex
			? { fromIndex: itemIndex, toIndex: hoveredIndex }
			: undefined;
	const activate = itemTabId !== hoveredTabId && !isHoveredActive;
	return { reorder, activate };
}
