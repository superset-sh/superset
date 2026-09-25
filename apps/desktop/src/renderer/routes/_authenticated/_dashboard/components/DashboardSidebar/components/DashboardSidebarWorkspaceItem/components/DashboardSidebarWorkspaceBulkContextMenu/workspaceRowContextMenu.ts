export type WorkspaceRowContextMenuPlan =
	| { menu: "bulk" }
	| { menu: "single"; clearSelectionFirst: boolean };

/**
 * Right-clicking a row must target what the checkmarks show: a selected row
 * in a multi-selection gets the bulk menu, while right-clicking outside the
 * selection drops it before the single-row menu opens.
 */
export function resolveWorkspaceRowContextMenu({
	canBulkSelect,
	isSelected,
	selectionCount,
}: {
	canBulkSelect: boolean;
	isSelected: boolean;
	selectionCount: number;
}): WorkspaceRowContextMenuPlan {
	if (canBulkSelect && isSelected && selectionCount > 1) {
		return { menu: "bulk" };
	}
	return {
		menu: "single",
		clearSelectionFirst: selectionCount > 0 && !isSelected,
	};
}
