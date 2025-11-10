import type { RouterOutputs } from "@superset/api";
import { Play } from "lucide-react";
import type React from "react";
import { useState } from "react";
import type { Tab, Workspace } from "shared/types";

type Task = RouterOutputs["task"]["all"][number];

interface TaskCardProps {
	task: Task;
	onClick: () => void;
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

const statusColors: Record<string, string> = {
	backlog: "bg-neutral-500",
	todo: "bg-blue-500",
	planning: "bg-yellow-500",
	working: "bg-amber-500",
	"needs-feedback": "bg-orange-500",
	"ready-to-merge": "bg-emerald-500",
	completed: "bg-green-600",
	canceled: "bg-red-500",
};

export const TaskCard: React.FC<TaskCardProps> = ({
	task,
	onClick,
	currentWorkspace,
	selectedWorktreeId,
	onTabSelect,
	onTabCreated,
	onUpdateTask,
}) => {
	const statusColor = statusColors[task.status] || "bg-neutral-500";
	const [isHovered, setIsHovered] = useState(false);

	const handleStartTask = async (e: React.MouseEvent) => {
		e.stopPropagation();

		if (!currentWorkspace) {
			console.error("No workspace selected");
			return;
		}

		// Find worktree to use: either the selected one, task's branch worktree, or first worktree
		let targetWorktreeId = selectedWorktreeId;

		if (!targetWorktreeId) {
			// Try to find a worktree matching the task's branch
			const taskWorktree = currentWorkspace.worktrees?.find(
				(wt) => wt.branch === task.branch,
			);

			if (taskWorktree) {
				targetWorktreeId = taskWorktree.id;
			} else if (currentWorkspace.worktrees && currentWorkspace.worktrees.length > 0) {
				// Use the first worktree as fallback
				targetWorktreeId = currentWorkspace.worktrees[0].id;
			}
		}

		if (!targetWorktreeId) {
			console.error("No worktree available to create terminal");
			return;
		}

		try {
			// Create a new terminal with claude command
			const taskPrompt = `${task.title}\n\n${task.description || ""}`.trim();
			// Escape quotes and newlines for shell command
			const escapedPrompt = taskPrompt
				.replace(/\\/g, '\\\\')  // Escape backslashes first
				.replace(/"/g, '\\"')     // Escape double quotes
				.replace(/\n/g, '\\n');   // Escape newlines
			const result = await window.ipcRenderer.invoke("tab-create", {
				workspaceId: currentWorkspace.id,
				worktreeId: targetWorktreeId,
				name: `Task: ${task.slug}`,
				type: "terminal",
				command: `claude --dangerously-skip-permissions "${escapedPrompt}"`,
			});

			if (result.success && result.tab) {
				const newTabId = result.tab.id;

				// Update task status to planning (pending)
				onUpdateTask(task.id, {
					title: task.title,
					description: task.description || "",
					status: "planning",
				});

				// Optimistically add the tab to state
				onTabCreated(targetWorktreeId, result.tab);

				// Select the new tab immediately
				onTabSelect(targetWorktreeId, newTabId);
			}
		} catch (error) {
			console.error("Error starting task:", error);
		}
	};

	return (
		<button
			type="button"
			onClick={onClick}
			onMouseEnter={() => setIsHovered(true)}
			onMouseLeave={() => setIsHovered(false)}
			className="w-full bg-neutral-900/40 hover:bg-neutral-900/70 border border-neutral-800/50 hover:border-neutral-700/70 rounded-xl p-3.5 text-left transition-all group shadow-sm hover:shadow-md relative"
		>
			{/* Task header */}
			<div className="flex items-start gap-2 mb-2.5">
				<div
					className={`w-1.5 h-1.5 rounded-full ${statusColor} mt-1.5 shadow-sm`}
				/>
				<span className="text-xs font-semibold text-neutral-500 group-hover:text-neutral-400 tracking-wide">
					{task.slug}
				</span>
			</div>

			{/* Task title */}
			<h3 className="text-sm font-medium text-neutral-200 group-hover:text-white mb-3 line-clamp-2 leading-snug">
				{task.title}
			</h3>

			{/* Task footer */}
			<div className="flex items-center justify-between mt-auto pt-1">
				{/* Assignee */}
				{task.assignee && (
					<div className="flex items-center gap-1.5">
						<img
							src={task.assignee.avatarUrl || "https://via.placeholder.com/24"}
							alt={task.assignee.name}
							className="w-6 h-6 rounded-full ring-2 ring-neutral-800 group-hover:ring-neutral-700 transition-all"
						/>
					</div>
				)}
				<div className="flex-1" />

				{/* Start Task button - appears on hover for TODO tasks */}
				{isHovered && task.status === "todo" && (
					<button
						type="button"
						onClick={handleStartTask}
						className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-md transition-colors flex items-center gap-1.5"
					>
						<Play size={12} className="fill-white" />
						<span>Start Task</span>
					</button>
				)}
			</div>
		</button>
	);
};
