import type { RouterOutputs } from "@superset/api";
import { Button } from "@superset/ui/button";
import {
	HoverCard,
	HoverCardContent,
	HoverCardTrigger,
} from "@superset/ui/hover-card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { GitPullRequest, PanelLeftClose, PanelLeftOpen, Plus, X } from "lucide-react";
import type React from "react";
import { useState } from "react";
import type { Worktree } from "shared/types";
import { Avatar } from "./Avatar";
import { StatusIndicator } from "./StatusIndicator";
import { CreatePRModal } from "../../../../components/CreatePRModal";

type Task = RouterOutputs["task"]["all"][number];

interface WorktreeTabsProps {
	onCollapseSidebar: () => void;
	onExpandSidebar: () => void;
	isSidebarOpen: boolean;
	worktrees: Worktree[];
	tasks?: Task[];
	selectedWorktreeId: string | null;
	onWorktreeSelect: (worktreeId: string) => void;
	workspaceId?: string;
	onDeleteWorktree?: (worktreeId: string) => void;
	onAddTask?: () => void;
}

export const TaskTabs: React.FC<WorktreeTabsProps> = ({
	onCollapseSidebar,
	onExpandSidebar,
	isSidebarOpen,
	worktrees,
	tasks = [],
	selectedWorktreeId,
	onWorktreeSelect,
	workspaceId,
	onDeleteWorktree,
	onAddTask,
}) => {
	const [isCreatePRModalOpen, setIsCreatePRModalOpen] = useState(false);

	// Get the selected worktree
	const selectedWorktree = worktrees.find((wt) => wt.id === selectedWorktreeId);

	// Match worktrees with tasks - only show worktrees that have a matching task
	const worktreesWithTasks = worktrees.map((worktree) => {
		const matchingTask = tasks.find((task) => {
			const matchByDescription = task.title && worktree.description?.toLowerCase() === task.title.toLowerCase();
			const matchByBranch = task.branch && worktree.branch === task.branch;
			// Also match by slug - worktree branch "super-5" matches task slug "SUPER-5"
			const matchBySlug = worktree.branch.toLowerCase() === task.slug.toLowerCase();
			return matchByDescription || matchByBranch || matchBySlug;
		});
		return { worktree, task: matchingTask };
	}).filter(({ task }) => task !== undefined);

	// Debug logging
	console.log("[TaskTabs] Total worktrees:", worktrees.length);
	console.log("[TaskTabs] Total tasks:", tasks.length);
	console.log("[TaskTabs] Matched worktrees with tasks:", worktreesWithTasks.length);
	console.log("[TaskTabs] Worktrees (full objects):", worktrees);
	console.log("[TaskTabs] Tasks (full objects):", tasks);
	console.log("[TaskTabs] Matched pairs (full objects):", worktreesWithTasks);

	const handleDeleteClick = (e: React.MouseEvent, worktreeId: string) => {
		e.stopPropagation(); // Prevent tab selection
		onDeleteWorktree?.(worktreeId);
	};
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

				{/* Task/Worktree tabs */}
				{worktreesWithTasks.map(({ worktree, task }) => {
					if (!task) return null;

					// Use task slug and title for display
					const displayTitle = `[${task.slug}] ${task.title}`;

					// Determine status color based on worktree state
					const hasActivity = worktree.tabs && worktree.tabs.length > 0;
					const hasPorts =
						worktree.detectedPorts &&
						Object.keys(worktree.detectedPorts).length > 0;
					const statusColor = hasPorts
						? "rgb(34, 197, 94)" // green - has running services
						: hasActivity
							? "rgb(234, 179, 8)" // yellow - has tabs/activity
							: "rgb(156, 163, 175)"; // gray - inactive

					// Status label mapping
					const STATUS_LABELS: Record<typeof task.status, string> = {
						backlog: "Backlog",
						todo: "To Do",
						planning: "Planning",
						working: "Working",
						"needs-feedback": "Needs Feedback",
						"ready-to-merge": "Ready to Merge",
						completed: "Completed",
						canceled: "Canceled",
					};

					return (
						<HoverCard key={worktree.id} openDelay={200}>
							<HoverCardTrigger asChild>
								<button
									type="button"
									onClick={() => onWorktreeSelect(worktree.id)}
									className={`
										group flex items-center gap-2 px-3 h-8 rounded-t-md transition-all border-t border-x relative
										${
											selectedWorktreeId === worktree.id
												? "bg-neutral-900 text-white border-neutral-700 -mb-px"
												: "bg-neutral-800/50 text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800 border-transparent"
										}
									`}
								>
									{/* Status indicator dot */}
									<StatusIndicator status={task.status} showLabel={false} size="sm" />
									<span className="text-sm whitespace-nowrap max-w-[200px] truncate">
										{displayTitle}
									</span>

									{/* Close button - show on hover */}
									{onDeleteWorktree && (
										<button
											type="button"
											onClick={(e) => handleDeleteClick(e, worktree.id)}
											className="opacity-0 group-hover:opacity-100 transition-opacity ml-1 -mr-1 p-0.5 hover:bg-neutral-700 rounded"
											aria-label="Delete worktree"
										>
											<X size={14} />
										</button>
									)}
								</button>
							</HoverCardTrigger>
							<HoverCardContent side="bottom" align="start" className="w-96">
								<div className="space-y-3">
									{/* Header with task slug/name and assignee */}
									<div className="flex items-start justify-between gap-3">
										<div className="flex-1 min-w-0">
											<h4 className="font-semibold text-sm text-white">
												[{task.slug}] {task.title}
											</h4>
											<p className="text-xs text-neutral-400 mt-1.5 leading-relaxed">
												{task.description || "No description"}
											</p>
										</div>

										{/* Assignee avatar and name */}
										{task.assignee && (
											<div className="shrink-0 flex items-center gap-2">
												<Avatar
													imageUrl={task.assignee.avatarUrl || null}
													name={task.assignee.name}
													size={24}
												/>
												<span className="text-xs text-neutral-300">{task.assignee.name}</span>
											</div>
										)}
									</div>

									{/* Metadata grid */}
									<div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs pt-2 border-t border-neutral-800">
										<div className="flex items-center gap-2">
											<span className="text-neutral-500">Status</span>
											<div className="flex items-center gap-1.5">
												<StatusIndicator
													status={task.status}
													showLabel={false}
													size="sm"
												/>
												<span className="text-neutral-300">{STATUS_LABELS[task.status]}</span>
											</div>
										</div>

										<div className="flex items-center gap-2">
											<span className="text-neutral-500">Updated</span>
											<span className="text-neutral-300">
												{new Date(task.updatedAt).toLocaleDateString()}
											</span>
										</div>

										<div className="flex items-center gap-2 col-span-2">
											<span className="text-neutral-500">Branch</span>
											<span className="text-neutral-300 font-mono text-xs truncate">
												{worktree.branch}
											</span>
										</div>
									</div>
								</div>
							</HoverCardContent>
						</HoverCard>
					);
				})}

				{/* New Task button */}
				{onAddTask && (
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
							<p>New Task</p>
						</TooltipContent>
					</Tooltip>
				)}

				{/* Create PR button - only show if we have workspace and a selected worktree */}
				{workspaceId && selectedWorktreeId && selectedWorktree && (
					<Tooltip>
						<TooltipTrigger asChild>
							<Button
								variant="ghost"
								size="icon-sm"
								className="ml-1"
								onClick={() => setIsCreatePRModalOpen(true)}
							>
								<GitPullRequest size={16} />
							</Button>
						</TooltipTrigger>
						<TooltipContent side="bottom">
							<p>Create Pull Request</p>
						</TooltipContent>
					</Tooltip>
				)}
			</div>

			{/* Create PR Modal */}
			{workspaceId && selectedWorktreeId && selectedWorktree && (
				<CreatePRModal
					isOpen={isCreatePRModalOpen}
					onClose={() => setIsCreatePRModalOpen(false)}
					workspaceId={workspaceId}
					worktreeId={selectedWorktreeId}
					defaultTitle={selectedWorktree.description || selectedWorktree.branch}
					defaultBody={selectedWorktree.description ? `Branch: ${selectedWorktree.branch}` : ""}
				/>
			)}
		</div>
	);
};
