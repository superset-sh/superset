import type { V2WorkspacesArchivedWindow } from "renderer/routes/_authenticated/_dashboard/v2-workspaces/stores/v2WorkspacesFilterStore";
import {
	BOARD_COLUMN_ORDER,
	type BoardColumnKey,
} from "renderer/routes/_authenticated/_dashboard/v2-workspaces/utils/deriveBoardColumn";

const ARCHIVED_COLUMNS = new Set<BoardColumnKey>(["merged", "deleted"]);

/**
 * Returns board columns that match the archived-workspace filter.
 * Empty terminal columns stay hidden when archived workspaces are hidden, while
 * populated terminal columns remain visible for live merged or deleted states.
 *
 * @param archivedWindow - The archived-workspace window selected by the user.
 * @param workspaceCount - Returns the number of workspaces in a board column.
 * @returns Board columns that should be rendered in workflow order.
 */
export function getVisibleBoardColumns(
	archivedWindow: V2WorkspacesArchivedWindow,
	workspaceCount: (column: BoardColumnKey) => number,
): BoardColumnKey[] {
	return BOARD_COLUMN_ORDER.filter(
		(column) =>
			archivedWindow !== "none" ||
			!ARCHIVED_COLUMNS.has(column) ||
			workspaceCount(column) > 0,
	);
}
