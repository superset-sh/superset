import type { V2WorkspacesArchivedWindow } from "renderer/routes/_authenticated/_dashboard/v2-workspaces/stores/v2WorkspacesFilterStore";
import {
	BOARD_COLUMN_ORDER,
	type BoardColumnKey,
} from "renderer/routes/_authenticated/_dashboard/v2-workspaces/utils/deriveBoardColumn";

const ARCHIVED_COLUMNS = new Set<BoardColumnKey>(["merged", "deleted"]);

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
