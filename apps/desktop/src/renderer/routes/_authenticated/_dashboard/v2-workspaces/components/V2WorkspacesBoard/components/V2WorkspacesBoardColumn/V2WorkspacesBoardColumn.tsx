import { cn } from "@superset/ui/utils";
import type { AccessibleV2Workspace } from "renderer/routes/_authenticated/_dashboard/v2-workspaces/hooks/useAccessibleV2Workspaces";
import {
	BOARD_COLUMN_LABELS,
	type BoardColumnKey,
} from "../../utils/deriveBoardColumn";
import { V2WorkspacesBoardCard } from "../V2WorkspacesBoardCard";

const COLUMN_DOT_STYLES: Record<BoardColumnKey, string> = {
	idle: "bg-muted-foreground/40",
	working: "bg-amber-500",
	attention: "bg-red-500",
	review: "bg-emerald-500",
	merged: "bg-violet-500",
	deleted: "bg-muted-foreground/60",
};

interface V2WorkspacesBoardColumnProps {
	column: BoardColumnKey;
	workspaces: AccessibleV2Workspace[];
}

export function V2WorkspacesBoardColumn({
	column,
	workspaces,
}: V2WorkspacesBoardColumnProps) {
	return (
		<div className="flex w-[280px] min-w-[280px] shrink-0 flex-col">
			{/* Column header — matches Linear style */}
			<div className="mb-1 flex items-center gap-2 px-2 py-1.5">
				<span
					className={cn("size-2 rounded-full", COLUMN_DOT_STYLES[column])}
				/>
				<span className="truncate text-sm font-medium">
					{BOARD_COLUMN_LABELS[column]}
				</span>
				<span className="text-xs tabular-nums text-muted-foreground">
					{workspaces.length}
				</span>
			</div>

			<div className="flex min-h-[60px] flex-1 flex-col gap-1 overflow-y-auto rounded-md p-0.5">
				{workspaces.map((workspace) => (
					<V2WorkspacesBoardCard key={workspace.id} workspace={workspace} />
				))}
			</div>
		</div>
	);
}
