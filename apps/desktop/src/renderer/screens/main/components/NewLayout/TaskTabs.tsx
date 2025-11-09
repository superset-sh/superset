import { Button } from "@superset/ui/button";
import {
	HoverCard,
	HoverCardContent,
	HoverCardTrigger,
} from "@superset/ui/hover-card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { Loader2, PanelLeftClose, PanelLeftOpen, Plus } from "lucide-react";
import type React from "react";
import type { Worktree } from "shared/types";
import { StatusIndicator, type TaskStatus } from "./StatusIndicator";
import { TaskAssignee } from "./TaskAssignee";

// Extended Worktree type with optional task metadata
export interface WorktreeWithTask extends Worktree {
	isPending?: boolean; // Flag for optimistic updates
	task?: {
		id: string;
		slug: string;
		title: string;
		status: TaskStatus;
		description: string;
		assignee?: {
			name: string;
			avatarUrl: string | null;
		};
		lastUpdated?: string;
	};
}

interface TaskTabsProps {
	onCollapseSidebar: () => void;
	onExpandSidebar: () => void;
	isSidebarOpen: boolean;
	onAddTask: () => void;
	worktrees: WorktreeWithTask[];
	selectedWorktreeId: string | null;
	onWorktreeSelect: (worktreeId: string) => void;
	mode?: "plan" | "edit";
	onModeChange?: (mode: "plan" | "edit") => void;
}

export const TaskTabs: React.FC<TaskTabsProps> = ({
	onCollapseSidebar,
	onExpandSidebar,
	isSidebarOpen,
	onAddTask,
	worktrees,
	selectedWorktreeId,
	onWorktreeSelect,
	mode = "edit",
	onModeChange,
}) => {
	return (
		<div
			className="flex items-end select-none bg-black/20"
			style={
				{
					height: "48px",
					paddingLeft: "88px",
					WebkitAppRegion: "drag",
				} as React.CSSProperties
			}
		>
			<div
				className="flex items-center gap-1 px-2 h-full"
				style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
			>
				{/* Sidebar collapse/expand toggle */}
				<div className="flex items-center gap-1 mr-2">
					{isSidebarOpen ? (
						<Tooltip>
							<TooltipTrigger asChild>
								<Button
									variant="ghost"
									size="icon-sm"
									onClick={onCollapseSidebar}
								>
									<PanelLeftClose size={16} />
								</Button>
							</TooltipTrigger>
							<TooltipContent side="bottom">
								<p>Collapse sidebar</p>
							</TooltipContent>
						</Tooltip>
					) : (
						<Tooltip>
							<TooltipTrigger asChild>
								<Button
									variant="ghost"
									size="icon-sm"
									onClick={onExpandSidebar}
								>
									<PanelLeftOpen size={16} />
								</Button>
							</TooltipTrigger>
							<TooltipContent side="bottom">
								<p>Expand sidebar</p>
							</TooltipContent>
						</Tooltip>
					)}
				</div>

				{/* Plan/Edit mode toggle */}
				{onModeChange && (
					<div className="flex items-center mr-3">
						<div className="inline-flex rounded-lg bg-neutral-800/50 p-0.5 gap-0.5">
							<button
								type="button"
								onClick={() => onModeChange("plan")}
								className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
									mode === "plan"
										? "bg-neutral-700 text-white"
										: "text-neutral-400 hover:text-neutral-200"
								}`}
							>
								Plan
							</button>
							<button
								type="button"
								onClick={() => onModeChange("edit")}
								className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
									mode === "edit"
										? "bg-neutral-700 text-white"
										: "text-neutral-400 hover:text-neutral-200"
								}`}
							>
								Edit
							</button>
						</div>
					</div>
				)}

				{/* Worktree tabs - each tab represents a worktree */}
				{worktrees.map((worktree) => {
					const hasTask = !!worktree.task;
					const task = worktree.task;
					const isPending = worktree.isPending;
					const displayTitle = hasTask && task
						? task.slug
						: worktree.description || worktree.branch;

					const statusLabel = task
						? task.status === "planning"
							? "Planning"
							: task.status === "working"
								? "Working"
								: task.status === "needs-feedback"
									? "Needs Feedback"
									: "Ready to Merge"
						: "";

					return (
						<HoverCard key={worktree.id} openDelay={200}>
							<HoverCardTrigger asChild>
								<button
									type="button"
									onClick={() => onWorktreeSelect(worktree.id)}
									disabled={isPending}
									className={`
										flex items-center gap-2 px-3 h-8 rounded-t-md transition-all border-t border-x
										${
											selectedWorktreeId === worktree.id
												? "bg-neutral-900 text-white border-neutral-700 -mb-px"
												: "bg-neutral-800/50 text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800 border-transparent"
										}
										${isPending ? "opacity-70 cursor-wait" : ""}
									`}
								>
									{isPending ? (
										<Loader2 size={14} className="animate-spin text-blue-400" />
									) : (
										hasTask &&
										task && <StatusIndicator status={task.status} showLabel={false} />
									)}
									<span className="text-sm whitespace-nowrap">
										{hasTask && task ? `[${task.slug}] ${task.title}` : displayTitle}
									</span>
								</button>
							</HoverCardTrigger>
							<HoverCardContent side="bottom" align="start" className="w-96">
								{isPending ? (
									<div className="space-y-2">
										{/* Pending state */}
										<div className="flex items-center gap-2">
											<Loader2 size={16} className="animate-spin text-blue-400" />
											<h4 className="font-semibold text-sm text-white">
												Creating worktree...
											</h4>
										</div>
										<p className="text-xs text-neutral-400">
											Setting up git worktree and initializing workspace
										</p>
									</div>
								) : hasTask && task ? (
									<div className="space-y-3">
										{/* Task view */}
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
													<StatusIndicator
														status={task.status}
														showLabel={false}
														size="sm"
													/>
													<span className="text-neutral-300">{statusLabel}</span>
												</div>
											</div>

											{task.lastUpdated && (
												<div className="flex items-center gap-2">
													<span className="text-neutral-500">Updated</span>
													<span className="text-neutral-300">
														{task.lastUpdated}
													</span>
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
												<span className="text-neutral-300">
													{worktree.tabs?.length || 0} open
												</span>
											</div>
										</div>
									</div>
								) : (
									<div className="space-y-2">
										{/* Worktree-only view */}
										<div>
											<span className="text-xs font-semibold text-neutral-500">
												Worktree
											</span>
											<h4 className="text-sm font-semibold text-white mt-1">
												{displayTitle}
											</h4>
										</div>
										<div className="text-xs text-neutral-400 space-y-1">
											<div className="flex items-center gap-2">
												<span className="text-neutral-500">Branch:</span>
												<code className="text-neutral-300 font-mono">
													{worktree.branch}
												</code>
											</div>
											<div className="flex items-center gap-2">
												<span className="text-neutral-500">Tabs:</span>
												<span className="text-neutral-300">
													{worktree.tabs?.length || 0} open
												</span>
											</div>
										</div>
									</div>
								)}
							</HoverCardContent>
						</HoverCard>
					);
				})}

				{/* Add task/worktree button */}
				<Tooltip>
					<TooltipTrigger asChild>
						<Button
							variant="ghost"
							size="icon-sm"
							className="ml-1"
							onClick={onAddTask}
						>
							<Plus size={18} />
						</Button>
					</TooltipTrigger>
					<TooltipContent side="bottom">
						<p>New task</p>
					</TooltipContent>
				</Tooltip>
			</div>
		</div>
	);
};
