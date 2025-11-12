import { Check } from "lucide-react";
import type React from "react";
import { Avatar } from "./Avatar";
import { StatusIndicator, type TaskStatus } from "./StatusIndicator";

interface Task {
	id: string;
	slug: string;
	name: string;
	status: TaskStatus;
	assignee: string;
	assigneeAvatarUrl: string;
	lastUpdated: string;
}

interface TaskListItemProps {
	task: Task;
	isSelected: boolean;
	isOpen: boolean;
	onClick: () => void;
}

export const TaskListItem: React.FC<TaskListItemProps> = ({
	task,
	isSelected,
	isOpen,
	onClick,
}) => {
	return (
		<button
			type="button"
			onClick={onClick}
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
					[{task.slug}] {task.name}
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
					<Avatar
						imageUrl={task.assigneeAvatarUrl}
						name={task.assignee}
						size={12}
					/>
					<span className="text-xs text-neutral-400">{task.assignee}</span>
				</div>
				<span className="text-xs text-neutral-500">·</span>
				<span className="text-xs text-neutral-500">{task.lastUpdated}</span>
			</div>
		</button>
	);
};
