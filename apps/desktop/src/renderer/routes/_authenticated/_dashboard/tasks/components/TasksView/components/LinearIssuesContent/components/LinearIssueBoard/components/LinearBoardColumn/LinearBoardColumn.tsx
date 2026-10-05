import { useDroppable } from "@dnd-kit/core";
import { cn } from "@superset/ui/utils";
import type { UIEvent } from "react";
import type { LinearIssue } from "../../../../../../../../utils/linearIssueTypes";
import { StatusIcon } from "../../../../../shared/StatusIcon";
import type { BoardColumn } from "../../utils/buildBoardColumns";
import { LinearBoardCard } from "../LinearBoardCard";

interface LinearBoardColumnProps {
	column: BoardColumn;
	issues: LinearIssue[];
	onOpen: (issue: LinearIssue) => void;
	onScroll: (event: UIEvent<HTMLDivElement>) => void;
}

export function LinearBoardColumn({
	column,
	issues,
	onOpen,
	onScroll,
}: LinearBoardColumnProps) {
	const { setNodeRef, isOver } = useDroppable({
		id: `column-${column.key}`,
		data: { column },
	});

	return (
		<div className="flex w-[280px] min-w-[280px] shrink-0 flex-col">
			<div className="mb-1 flex items-center gap-2 px-2 py-1.5">
				<StatusIcon type={column.type} color={column.color} />
				<span className="truncate text-sm font-medium">{column.name}</span>
				<span className="text-xs text-muted-foreground tabular-nums">
					{issues.length}
				</span>
			</div>
			<div
				ref={setNodeRef}
				onScroll={onScroll}
				className={cn(
					"flex min-h-[60px] flex-1 flex-col gap-1 overflow-y-auto rounded-md p-0.5 transition-colors",
					isOver && "bg-accent/20 ring-1 ring-accent/40",
				)}
			>
				{issues.map((issue) => (
					<LinearBoardCard key={issue.id} issue={issue} onOpen={onOpen} />
				))}
			</div>
		</div>
	);
}
