import type { RouterOutputs } from "@superset/api";
import type React from "react";
import type { Tab, Workspace } from "shared/types";
import { TaskCard } from "./TaskCard";

type Task = RouterOutputs["task"]["all"][number];

interface KanbanColumnProps {
	title: string;
	tasks: Task[];
	onTaskClick: (task: Task) => void;
	statusColor?: string;
	currentWorkspace: Workspace | null;
	selectedWorktreeId: string | null;
	onTabSelect: (worktreeId: string, tabId: string) => void;
	onTabCreated: (worktreeId: string, tab: Tab) => void;
	onUpdateTask: (
		taskId: string,
		updates: {
			title: string;
			description: string;
			status: Task["status"];
			assigneeId?: string | null;
		},
	) => void;
}

export const KanbanColumn: React.FC<KanbanColumnProps> = ({
	title,
	tasks,
	onTaskClick,
	statusColor = "bg-neutral-500",
	currentWorkspace,
	selectedWorktreeId,
	onTabSelect,
	onTabCreated,
	onUpdateTask,
}) => {
	return (
		<div className="flex flex-col h-full min-w-[300px] w-[300px]">
			{/* Column header */}
			<div className="flex items-center justify-between px-4 py-3 mb-3 bg-neutral-900/30 rounded-t-xl border-b border-neutral-800/50">
				<div className="flex items-center gap-2.5">
					<div className={`w-2 h-2 rounded-full ${statusColor} shadow-sm`} />
					<h2 className="text-xs font-semibold text-neutral-300 uppercase tracking-wider">
						{title}
					</h2>
				</div>
				<span className="text-xs text-neutral-500 font-medium bg-neutral-800/50 px-2 py-0.5 rounded-md">
					{tasks.length}
				</span>
			</div>

			{/* Column content - scrollable */}
			<div className="flex-1 overflow-y-auto px-3 space-y-2.5 pb-4">
				{tasks.map((task) => (
					<TaskCard
						key={task.id}
						task={task}
						onClick={() => onTaskClick(task)}
						currentWorkspace={currentWorkspace}
						selectedWorktreeId={selectedWorktreeId}
						onTabSelect={onTabSelect}
						onTabCreated={onTabCreated}
						onUpdateTask={onUpdateTask}
					/>
				))}
			</div>
		</div>
	);
};
