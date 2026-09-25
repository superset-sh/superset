import { useMemo } from "react";
import type { AccessibleV2Workspace } from "renderer/routes/_authenticated/_dashboard/workspaces/hooks/useAccessibleWorkspaces";
import { useWorkspacesFilterStore } from "renderer/routes/_authenticated/_dashboard/workspaces/stores/workspacesFilterStore";
import { isWithinArchivedWindow } from "renderer/routes/_authenticated/_dashboard/workspaces/utils/archivedWindow";
import {
	BOARD_COLUMN_ORDER,
	type BoardColumnKey,
	deriveBoardColumn,
} from "renderer/routes/_authenticated/_dashboard/workspaces/utils/deriveBoardColumn";
import { compareWorkspaces } from "renderer/routes/_authenticated/_dashboard/workspaces/utils/sortWorkspaces";
import { WorkspacesBoardColumn } from "./components/WorkspacesBoardColumn";
import { getVisibleBoardColumns } from "./utils/getVisibleBoardColumns";

interface WorkspacesBoardProps {
	workspaces: AccessibleV2Workspace[];
	isReady: boolean;
}

export function WorkspacesBoard({ workspaces, isReady }: WorkspacesBoardProps) {
	const archivedWindow = useWorkspacesFilterStore(
		(state) => state.archivedWindow,
	);
	const sortMode = useWorkspacesFilterStore((state) => state.sortMode);
	const hiddenLanes = useWorkspacesFilterStore((state) => state.hiddenLanes);

	const byColumn = useMemo(() => {
		const now = Date.now();
		const map = new Map<BoardColumnKey, AccessibleV2Workspace[]>(
			BOARD_COLUMN_ORDER.map((column) => [column, []]),
		);
		for (const workspace of workspaces) {
			if (
				workspace.archivedAt != null &&
				!isWithinArchivedWindow(workspace.archivedAt, archivedWindow, now)
			) {
				continue;
			}
			map.get(deriveBoardColumn(workspace))?.push(workspace);
		}
		for (const column of map.values()) {
			column.sort((a, b) => compareWorkspaces(a, b, sortMode));
		}
		return map;
	}, [workspaces, archivedWindow, sortMode]);

	const isEmpty = workspaces.length === 0;
	if (isEmpty && !isReady) {
		// Cache-first rule: only a settled source may claim emptiness.
		return null;
	}

	const visibleColumns = getVisibleBoardColumns(
		archivedWindow,
		(column) => byColumn.get(column)?.length ?? 0,
	).filter((column) => !hiddenLanes.includes(column));

	return (
		<div className="flex-1 overflow-x-auto overflow-y-hidden">
			<div className="flex h-full min-w-max gap-3 px-6 py-4">
				{visibleColumns.map((column) => (
					<WorkspacesBoardColumn
						key={column}
						column={column}
						workspaces={byColumn.get(column) ?? []}
					/>
				))}
			</div>
		</div>
	);
}
