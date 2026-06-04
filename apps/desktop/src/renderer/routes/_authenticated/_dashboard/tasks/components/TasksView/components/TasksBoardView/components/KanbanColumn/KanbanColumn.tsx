import { useDroppable } from "@dnd-kit/core";
import {
	SortableContext,
	verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import type { SelectTaskStatus } from "@superset/db/schema";
import { cn } from "@superset/ui/utils";
import {
	StatusIcon,
	type StatusType,
} from "../../../../components/shared/StatusIcon";
import type { TaskWithStatus } from "../../../../hooks/useTasksData";
import { KanbanCard } from "../KanbanCard";

interface KanbanColumnProps {
	status: SelectTaskStatus;
	tasks: TaskWithStatus[];
	onTaskClick: (task: TaskWithStatus) => void;
}

export function KanbanColumn({
	status,
	tasks,
	onTaskClick,
}: KanbanColumnProps) {
	const { setNodeRef, isOver } = useDroppable({
		id: `column-${status.id}`,
		data: { type: "column", statusId: status.id },
	});

	const taskIds = tasks.map((t) => t.id);

	return (
		<div className="flex flex-col min-w-[280px] w-[280px] shrink-0">
			{/* Column header — matches Linear style */}
			<div className="flex items-center gap-2 px-2 py-1.5 mb-1">
				<StatusIcon
					type={status.type as StatusType}
					color={status.color}
					progress={status.progressPercent ?? undefined}
				/>
				<span className="text-sm font-medium capitalize truncate">
					{status.name}
				</span>
				<span className="text-xs text-muted-foreground tabular-nums">
					{tasks.length}
				</span>
			</div>

			{/* Drop zone */}
			<div
				ref={setNodeRef}
				className={cn(
					"flex-1 flex flex-col gap-1 overflow-y-auto min-h-[60px] rounded-md p-0.5 transition-colors",
					isOver && "bg-accent/20 ring-1 ring-accent/40",
				)}
			>
				<SortableContext items={taskIds} strategy={verticalListSortingStrategy}>
					{tasks.map((task) => (
						<KanbanCard
							key={task.id}
							task={task}
							onClick={() => onTaskClick(task)}
						/>
					))}
				</SortableContext>
			</div>
		</div>
	);
}
