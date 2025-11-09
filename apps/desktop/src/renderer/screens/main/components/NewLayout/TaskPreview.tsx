import type { RouterOutputs } from "@superset/api";
import type React from "react";
import { formatRelativeTime } from "shared/utils";
import { Avatar } from "./Avatar";
import { StatusIndicator, type TaskStatus } from "./StatusIndicator";

// Use the tRPC API type for tasks
type Task = RouterOutputs["task"]["all"][number];

interface TaskPreviewProps {
	task: Task | null;
	onOpenTask?: () => void;
}

const STATUS_LABELS: Record<TaskStatus, string> = {
	backlog: "Backlog",
	todo: "To Do",
	planning: "Planning",
	working: "Working",
	"needs-feedback": "Needs Feedback",
	"ready-to-merge": "Ready to Merge",
	completed: "Completed",
	canceled: "Canceled",
};

export const TaskPreview: React.FC<TaskPreviewProps> = ({ task, onOpenTask }) => {
	if (!task) {
		return (
			<div className="flex items-center justify-center h-full text-neutral-500 text-sm">
				Select a task to view details
			</div>
		);
	}

	return (
		<div className="flex flex-col h-full p-6">
			{/* Header with task name */}
			<div className="flex items-start justify-between gap-4 mb-4">
				<div className="flex-1 min-w-0">
					<h3 className="text-lg font-semibold text-white mb-2">
						[{task.slug}] {task.title}
					</h3>
				</div>
			</div>

			{/* Description */}
			<div className="mb-6">
				<p className="text-sm text-neutral-300 leading-relaxed">{task.description || "No description provided"}</p>
			</div>

			{/* Metadata grid */}
			<div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm mb-8 pb-6 border-b border-neutral-800">
				<div>
					<div className="text-neutral-500 mb-1">Status</div>
					<div className="flex items-center gap-2">
						<StatusIndicator status={task.status} showLabel={false} size="sm" />
						<span className="text-neutral-200">{STATUS_LABELS[task.status]}</span>
					</div>
				</div>

				<div>
					<div className="text-neutral-500 mb-1">Assignee</div>
					<div className="flex items-center gap-1.5">
						<Avatar imageUrl={task.assignee?.avatarUrl || null} name={task.assignee?.name || "Unassigned"} size={16} />
						<span className="text-neutral-200">{task.assignee?.name || "Unassigned"}</span>
					</div>
				</div>

				<div>
					<div className="text-neutral-500 mb-1">Updated</div>
					<div className="text-neutral-200">{formatRelativeTime(task.updatedAt)}</div>
				</div>

				<div>
					<div className="text-neutral-500 mb-1">Branch</div>
					<div className="text-neutral-200 font-mono text-xs">{task.branch || "No branch set"}</div>
				</div>
			</div>
		</div>
	);
};
