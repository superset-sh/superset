import type { WorkspacesArchivedWindow } from "renderer/routes/_authenticated/_dashboard/workspaces/stores/workspacesFilterStore";
import {
	BOARD_COLUMN_ORDER,
	type BoardColumnKey,
} from "renderer/routes/_authenticated/_dashboard/workspaces/utils/deriveBoardColumn";

const ARCHIVED_COLUMNS = new Set<BoardColumnKey>(["merged", "deleted"]);

export function getVisibleBoardColumns(
	archivedWindow: WorkspacesArchivedWindow,
	workspaceCount: (column: BoardColumnKey) => number,
): BoardColumnKey[] {
	return BOARD_COLUMN_ORDER.filter(
		(column) =>
			archivedWindow !== "none" ||
			!ARCHIVED_COLUMNS.has(column) ||
			workspaceCount(column) > 0,
	);
}
