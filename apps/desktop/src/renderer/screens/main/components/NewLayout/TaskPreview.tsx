import type React from "react";
import { StatusIndicator, type TaskStatus } from "./StatusIndicator";
import { TaskAssignee } from "./TaskAssignee";

interface Task {
	id: string;
	slug: string;
	name: string;
	status: TaskStatus;
	branch: string;
	description: string;
	assignee: string;
	assigneeAvatarUrl: string;
	lastUpdated: string;
}

interface TaskPreviewProps {
	task: Task | null;
	onOpenTask?: () => void;
}

const STATUS_LABELS: Record<TaskStatus, string> = {
	planning: "Planning",
	working: "Working",
	"needs-feedback": "Needs Feedback",
	"ready-to-merge": "Ready to Merge",
};

export const TaskPreview: React.FC<TaskPreviewProps> = ({
	task,
	onOpenTask,
}) => {
	if (!task) {
		return (
			<div className="flex items-center justify-center h-full text-neutral-500 text-sm">
				Select a task to view details
			</div>
		);
	}

	return (
		<div className="flex flex-col h-full p-6">
			{/* Header with task name and assignee */}
			<div className="flex items-start justify-between gap-4 mb-4">
				<div className="flex-1 min-w-0">
					<h3 className="text-lg font-semibold text-white mb-2">
						[{task.slug}] {task.name}
					</h3>
				</div>
				<div className="shrink-0">
					<TaskAssignee
						userName={task.assignee}
						userAvatarUrl={task.assigneeAvatarUrl}
					/>
				</div>
			</div>

			{/* Description */}
			<div className="mb-6">
				<p className="text-sm text-neutral-300 leading-relaxed">
					{task.description}
				</p>
			</div>

			{/* Metadata grid */}
			<div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm mb-8 pb-6 border-b border-neutral-800">
				<div>
					<div className="text-neutral-500 mb-1">Status</div>
					<div className="flex items-center gap-2">
						<StatusIndicator status={task.status} showLabel={false} size="sm" />
						<span className="text-neutral-200">
							{STATUS_LABELS[task.status]}
						</span>
					</div>
				</div>

				<div>
					<div className="text-neutral-500 mb-1">Updated</div>
					<div className="text-neutral-200">{task.lastUpdated}</div>
				</div>

				<div className="col-span-2">
					<div className="text-neutral-500 mb-1">Branch</div>
					<div className="text-neutral-200 font-mono text-xs">
						{task.branch}
					</div>
				</div>
			</div>
		</div>
	);
};
