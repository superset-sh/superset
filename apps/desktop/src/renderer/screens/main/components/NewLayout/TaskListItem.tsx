import type { RouterOutputs } from "@superset/api";
import { Check } from "lucide-react";
import type React from "react";
import { formatRelativeTime } from "shared/utils";
import { Avatar } from "./Avatar";
import { StatusIndicator } from "./StatusIndicator";

// Use the tRPC API type for tasks
type Task = RouterOutputs["task"]["all"][number];

interface TaskListItemProps {
	task: Task;
	isSelected: boolean;
	isOpen: boolean;
	onClick: () => void;
	onDoubleClick?: () => void;
}

export const TaskListItem: React.FC<TaskListItemProps> = ({
	task,
	isSelected,
	isOpen,
	onClick,
	onDoubleClick,
}) => {
	return (
		<button
			type="button"
			onClick={onClick}
			onDoubleClick={onDoubleClick}
			className={`
				w-full text-left px-3 py-2.5 rounded-md transition-all
				${
					isSelected
						? "bg-neutral-800/80 border-l-2 border-blue-500 shadow-sm"
						: "hover:bg-neutral-800/60 border-l-2 border-transparent"
				}
			`}
		>
			{/* First line: Status + ID + Name */}
			<div className="flex items-center gap-2 mb-1">
				<StatusIndicator status={task.status} showLabel={false} size="sm" />
				<span className="text-sm text-white font-medium truncate">
					[{task.slug}] {task.title}
				</span>
				{isOpen && (
					<span className="ml-auto flex items-center gap-1 text-xs text-green-500 shrink-0">
						<Check size={12} />
						Opened
					</span>
				)}
			</div>

			{/* Second line: Assignee + Time */}
			<div className="flex items-center gap-2 ml-5">
				<div className="flex items-center gap-1.5">
					<Avatar imageUrl={task.assignee?.avatarUrl || null} name={task.assignee?.name || "Unassigned"} size={12} />
					<span className="text-xs text-neutral-400">{task.assignee?.name || "Unassigned"}</span>
				</div>
				<span className="text-xs text-neutral-500">·</span>
				<span className="text-xs text-neutral-500">{formatRelativeTime(task.updatedAt)}</span>
			</div>
		</button>
	);
};
