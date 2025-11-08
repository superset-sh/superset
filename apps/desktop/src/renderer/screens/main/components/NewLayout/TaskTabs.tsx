import { Button } from "@superset/ui/button";
import {
	HoverCard,
	HoverCardContent,
	HoverCardTrigger,
} from "@superset/ui/hover-card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { PanelLeftClose, PanelLeftOpen, Plus } from "lucide-react";
import type React from "react";
import { useState } from "react";
import { TaskAssignee } from "./TaskAssignee";
import { StatusIndicator, type TaskStatus } from "./StatusIndicator";

interface MockTask {
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

const MOCK_TASKS: MockTask[] = [
	{
		id: "1",
		slug: "SSET-1",
		name: "Homepage Redesign",
		status: "working",
		branch: "feature/homepage-redesign",
		description: "Redesigning the homepage with new branding and improved UX",
		assignee: "Alice",
		assigneeAvatarUrl: "https://i.pravatar.cc/150?img=1",
		lastUpdated: "2 hours ago",
	},
	{
		id: "2",
		slug: "SSET-2",
		name: "API Integration",
		status: "needs-feedback",
		branch: "feature/api-integration",
		description: "Integrate new REST API endpoints for user management",
		assignee: "Bob",
		assigneeAvatarUrl: "https://i.pravatar.cc/150?img=12",
		lastUpdated: "1 day ago",
	},
	{
		id: "3",
		slug: "SSET-3",
		name: "Bug Fixes",
		status: "planning",
		branch: "fix/various-bugs",
		description: "Collection of bug fixes reported by users",
		assignee: "Charlie",
		assigneeAvatarUrl: "https://i.pravatar.cc/150?img=33",
		lastUpdated: "3 days ago",
	},
	{
		id: "4",
		slug: "SSET-4",
		name: "Performance Optimization",
		status: "ready-to-merge",
		branch: "perf/optimize-queries",
		description: "Optimize database queries for faster page loads",
		assignee: "Diana",
		assigneeAvatarUrl: "https://i.pravatar.cc/150?img=9",
		lastUpdated: "5 minutes ago",
	},
];

interface TaskTabsProps {
	onCollapseSidebar: () => void;
	onExpandSidebar: () => void;
	isSidebarOpen: boolean;
	onAddTask: () => void;
	activeTaskId: string;
	onActiveTaskChange: (taskId: string) => void;
	openTasks: MockTask[];
}

export const TaskTabs: React.FC<TaskTabsProps> = ({
	onCollapseSidebar,
	onExpandSidebar,
	isSidebarOpen,
	onAddTask,
	activeTaskId,
	onActiveTaskChange,
	openTasks,
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

				{/* Task tabs */}
				{openTasks.map((task) => {
					const statusLabel = task.status === "planning" ? "Planning" :
						task.status === "working" ? "Working" :
						task.status === "needs-feedback" ? "Needs Feedback" :
						"Ready to Merge";

					return (
						<HoverCard key={task.id} openDelay={200}>
							<HoverCardTrigger asChild>
								<button
									type="button"
									onClick={() => onActiveTaskChange(task.id)}
									className={`
										flex items-center gap-2 px-3 h-8 rounded-t-md transition-all border-t border-x
										${
											activeTaskId === task.id
												? "bg-neutral-900 text-white border-neutral-700 -mb-px"
												: "bg-neutral-800/50 text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800 border-transparent"
										}
									`}
								>
									<StatusIndicator status={task.status} showLabel={false} />
									<span className="text-sm whitespace-nowrap">
										[{task.slug}] {task.name}
									</span>
								</button>
							</HoverCardTrigger>
							<HoverCardContent side="bottom" align="start" className="w-96">
								<div className="space-y-3">
									{/* Header with task slug/name and assignee */}
									<div className="flex items-start justify-between gap-3">
										<div className="flex-1 min-w-0">
											<h4 className="font-semibold text-sm text-white">
												[{task.slug}] {task.name}
											</h4>
											<p className="text-xs text-neutral-400 mt-1.5 leading-relaxed">
												{task.description}
											</p>
										</div>

										{/* Assignee in top-right */}
										<div className="shrink-0">
											<TaskAssignee
												userName={task.assignee}
												userAvatarUrl={task.assigneeAvatarUrl}
											/>
										</div>
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
												<span className="text-neutral-300">{statusLabel}</span>
											</div>
										</div>

										<div className="flex items-center gap-2">
											<span className="text-neutral-500">Updated</span>
											<span className="text-neutral-300">
												{task.lastUpdated}
											</span>
										</div>

										<div className="flex items-center gap-2 col-span-2">
											<span className="text-neutral-500">Branch</span>
											<span className="text-neutral-300 font-mono text-xs truncate">
												{task.branch}
											</span>
										</div>
									</div>
								</div>
							</HoverCardContent>
						</HoverCard>
					);
				})}
				<Tooltip>
					<TooltipTrigger asChild>
						<Button variant="ghost" size="icon-sm" className="ml-1" onClick={onAddTask}>
							<Plus size={18} />
						</Button>
					</TooltipTrigger>
					<TooltipContent side="bottom">
						<p>Open task</p>
					</TooltipContent>
				</Tooltip>
			</div>
		</div>
	);
};
