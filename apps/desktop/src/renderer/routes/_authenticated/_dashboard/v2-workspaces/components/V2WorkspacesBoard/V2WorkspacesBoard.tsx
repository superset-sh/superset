import { useMemo } from "react";
import type { AccessibleV2Workspace } from "renderer/routes/_authenticated/_dashboard/v2-workspaces/hooks/useAccessibleV2Workspaces";
import {
	useV2WorkspacesFilterStore,
	type V2WorkspacesArchivedWindow,
} from "renderer/routes/_authenticated/_dashboard/v2-workspaces/stores/v2WorkspacesFilterStore";
import { V2WorkspacesBoardColumn } from "./components/V2WorkspacesBoardColumn";
import {
	BOARD_COLUMN_ORDER,
	type BoardColumnKey,
	deriveBoardColumn,
} from "./utils/deriveBoardColumn";

const DAY_MS = 24 * 60 * 60 * 1000;
const ARCHIVED_WINDOW_MS: Record<
	Exclude<V2WorkspacesArchivedWindow, "none" | "all">,
	number
> = {
	week: 7 * DAY_MS,
	month: 30 * DAY_MS,
};

function isWithinArchivedWindow(
	archivedAt: number,
	window: V2WorkspacesArchivedWindow,
	now: number,
): boolean {
	if (window === "none") return false;
	if (window === "all") return true;
	return archivedAt >= now - ARCHIVED_WINDOW_MS[window];
}

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
		return map;
	}, [workspaces, archivedWindow]);

	const isEmpty = workspaces.length === 0;
	if (isEmpty && !isReady) {
		// Cache-first rule: only a settled source may claim emptiness.
		return null;
	}

	return (
		<div className="flex-1 overflow-x-auto overflow-y-hidden">
			<div className="flex h-full min-w-max gap-2 px-6 py-4">
				{BOARD_COLUMN_ORDER.map((column) => (
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
