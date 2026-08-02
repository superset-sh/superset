import { type MouseEvent, useCallback } from "react";
import { useDashboardSidebarSelection } from "../../../../providers/DashboardSidebarSelectionProvider";
import { useWorkspaceBulkMenuScope } from "../WorkspaceBulkMenuScope";
import { resolveWorkspaceRowContextMenu } from "./workspaceRowContextMenu";

/**
 * Row-level right-click behavior for the selection feature: decides whether
 * the row shows the bulk menu, suppresses macOS Ctrl-click context menus on
 * selectable rows (Ctrl-click toggles selection instead), and drops the
 * selection before a single-row menu opens on a row outside it.
 */
export function useWorkspaceRowContextMenu({
	isSelected,
	canBulkSelect,
}: {
	isSelected: boolean;
	canBulkSelect: boolean;
}): {
	isBulkMenu: boolean;
	onRowContextMenu: (event: MouseEvent<HTMLElement>) => void;
} {
	const scope = useWorkspaceBulkMenuScope();
	const { selectedWorkspaceIds, clearSelection } =
		useDashboardSidebarSelection();
	const plan = resolveWorkspaceRowContextMenu({
		canBulkSelect: canBulkSelect && scope != null,
		isSelected,
		selectionCount: selectedWorkspaceIds.length,
	});

	const clearSelectionFirst =
		plan.menu === "single" && plan.clearSelectionFirst;
	const onRowContextMenu = useCallback(
		(event: MouseEvent<HTMLElement>) => {
			if (event.ctrlKey && canBulkSelect) {
				event.preventDefault();
				event.stopPropagation();
				return;
			}
			if (clearSelectionFirst) clearSelection();
		},
		[canBulkSelect, clearSelection, clearSelectionFirst],
	);

	return { isBulkMenu: plan.menu === "bulk", onRowContextMenu };
}
