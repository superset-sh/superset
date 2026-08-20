import { useMemo } from "react";
import type { AccessibleV2Workspace } from "renderer/routes/_authenticated/_dashboard/v2-workspaces/hooks/useAccessibleV2Workspaces";
import { useV2WorkspacesFilterStore } from "renderer/routes/_authenticated/_dashboard/v2-workspaces/stores/v2WorkspacesFilterStore";
import { isWithinArchivedWindow } from "renderer/routes/_authenticated/_dashboard/v2-workspaces/utils/archivedWindow";
import {
	BOARD_COLUMN_ORDER,
	type BoardColumnKey,
	deriveBoardColumn,
} from "renderer/routes/_authenticated/_dashboard/v2-workspaces/utils/deriveBoardColumn";
import { compareWorkspaces } from "renderer/routes/_authenticated/_dashboard/v2-workspaces/utils/sortWorkspaces";
import { V2WorkspacesBoardColumn } from "./components/V2WorkspacesBoardColumn";
import { getVisibleBoardColumns } from "./utils/getVisibleBoardColumns";

interface V2WorkspacesBoardProps {
	workspaces: AccessibleV2Workspace[];
	isReady: boolean;
}

export function V2WorkspacesBoard({
	workspaces,
	isReady,
}: V2WorkspacesBoardProps) {
	const archivedWindow = useV2WorkspacesFilterStore(
		(state) => state.archivedWindow,
	);
	const sortMode = useV2WorkspacesFilterStore((state) => state.sortMode);
	const hiddenLanes = useV2WorkspacesFilterStore((state) => state.hiddenLanes);

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
			<div className="flex h-full min-w-max gap-2 px-6 py-4">
				{visibleColumns.map((column) => (
					<V2WorkspacesBoardColumn
						key={column}
						column={column}
						workspaces={byColumn.get(column) ?? []}
					/>
				))}
			</div>
		</div>
	);
}
