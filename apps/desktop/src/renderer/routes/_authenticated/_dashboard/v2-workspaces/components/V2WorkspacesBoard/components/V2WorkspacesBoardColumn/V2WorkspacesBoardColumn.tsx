import { i18n } from "@superset/i18n";
import { BoardColumnIcon } from "renderer/routes/_authenticated/_dashboard/v2-workspaces/components/BoardColumnIcon";
import type { AccessibleV2Workspace } from "renderer/routes/_authenticated/_dashboard/v2-workspaces/hooks/useAccessibleV2Workspaces";
import {
	BOARD_COLUMN_LABELS,
	type BoardColumnKey,
} from "renderer/routes/_authenticated/_dashboard/v2-workspaces/utils/deriveBoardColumn";
import { V2WorkspacesBoardCard } from "../V2WorkspacesBoardCard";

interface V2WorkspacesBoardColumnProps {
	column: BoardColumnKey;
	workspaces: AccessibleV2Workspace[];
}

export function V2WorkspacesBoardColumn({
	column,
	workspaces,
}: V2WorkspacesBoardColumnProps) {
	return (
		// Linear-style lane: a surface one step above the page so the cards
		// read as items sitting in a column rather than floating on the canvas.
		<div className="flex w-[280px] min-w-[280px] shrink-0 flex-col rounded-lg bg-muted/30">
			<div className="flex items-center gap-2 px-3 pt-2.5 pb-2">
				<BoardColumnIcon column={column} />
				<span className="truncate text-[13px] font-medium">
					{i18n._(BOARD_COLUMN_LABELS[column])}
				</span>
				<span className="text-xs tabular-nums text-muted-foreground">
					{workspaces.length}
				</span>
			</div>

			<div className="flex min-h-[60px] flex-1 flex-col gap-2 overflow-y-auto px-2 pb-2">
				{workspaces.map((workspace) => (
					<V2WorkspacesBoardCard key={workspace.id} workspace={workspace} />
				))}
			</div>
		</div>
	);
}
