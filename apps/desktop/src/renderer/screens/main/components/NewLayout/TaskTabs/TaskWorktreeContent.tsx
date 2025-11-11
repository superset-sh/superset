import type React from "react";
import { StatusIndicator } from "../StatusIndicator";
import { TaskAssignee } from "../TaskAssignee";
import type { WorktreeWithTask } from "./types";
import { getStatusLabel } from "./utils";

interface TaskWorktreeContentProps {
	worktree: WorktreeWithTask;
	task: NonNullable<WorktreeWithTask["task"]>;
}

export const TaskWorktreeContent: React.FC<TaskWorktreeContentProps> = ({
	worktree,
	task,
}) => {
	const statusLabel = getStatusLabel(task.status);

	return (
		<div className="space-y-3">
			<div className="flex items-start justify-between gap-3">
				<div className="flex-1 min-w-0">
					<h4 className="font-semibold text-sm text-white">
						[{task.slug}] {task.title}
					</h4>
					<p className="text-xs text-neutral-400 mt-1.5 leading-relaxed">
						{task.description}
					</p>
				</div>

				{task.assignee && (
					<div className="shrink-0">
						<TaskAssignee
							userName={task.assignee.name}
							userAvatarUrl={task.assignee.avatarUrl}
						/>
					</div>
				)}
			</div>

			<div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs pt-2 border-t border-neutral-800">
				<div className="flex items-center gap-2">
					<span className="text-neutral-500">Status</span>
					<div className="flex items-center gap-1.5">
						<StatusIndicator status={task.status} showLabel={false} size="sm" />
						<span className="text-neutral-300">{statusLabel}</span>
					</div>
				</div>

				{task.lastUpdated && (
					<div className="flex items-center gap-2">
						<span className="text-neutral-500">Updated</span>
						<span className="text-neutral-300">{task.lastUpdated}</span>
					</div>
				)}

				<div className="flex items-center gap-2 col-span-2">
					<span className="text-neutral-500">Branch</span>
					<span className="text-neutral-300 font-mono text-xs truncate">
						{worktree.branch}
					</span>
				</div>

				<div className="flex items-center gap-2 col-span-2">
					<span className="text-neutral-500">Tabs</span>
					<span className="text-neutral-300">{worktree.tabs?.length || 0} open</span>
				</div>
			</div>
		</div>
	);
};
