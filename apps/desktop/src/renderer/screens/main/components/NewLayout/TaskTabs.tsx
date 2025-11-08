import { Button } from "@superset/ui/button";
import {
	HoverCard,
	HoverCardContent,
	HoverCardTrigger,
} from "@superset/ui/hover-card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import type React from "react";
import type { Worktree } from "shared/types";

interface WorktreeTabsProps {
	onCollapseSidebar: () => void;
	onExpandSidebar: () => void;
	isSidebarOpen: boolean;
	worktrees: Worktree[];
	selectedWorktreeId: string | null;
	onWorktreeSelect: (worktreeId: string) => void;
}

export const TaskTabs: React.FC<WorktreeTabsProps> = ({
	onCollapseSidebar,
	onExpandSidebar,
	isSidebarOpen,
	worktrees,
	selectedWorktreeId,
	onWorktreeSelect,
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

				{/* Worktree tabs */}
				{worktrees.map((worktree) => {
					// Use description as title if available, otherwise use branch name
					const displayTitle = worktree.description || worktree.branch;

					return (
						<Tooltip key={worktree.id}>
							<TooltipTrigger asChild>
								<button
									type="button"
									onClick={() => onWorktreeSelect(worktree.id)}
									className={`
										flex items-center gap-2 px-3 h-8 rounded-t-md transition-all border-t border-x
										${
											selectedWorktreeId === worktree.id
												? "bg-neutral-900 text-white border-neutral-700 -mb-px"
												: "bg-neutral-800/50 text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800 border-transparent"
										}
									`}
								>
									<span className="text-sm whitespace-nowrap max-w-[200px] truncate">
										{displayTitle}
									</span>
								</button>
							</TooltipTrigger>
							<TooltipContent side="bottom" className="max-w-xs">
								<div className="space-y-1">
									{worktree.description && (
										<p className="text-sm font-medium">
											{worktree.description}
										</p>
									)}
									<p className="text-xs text-neutral-400">
										<span className="font-medium">Branch:</span>{" "}
										{worktree.branch}
									</p>
									<p className="text-xs text-neutral-400">
										<span className="font-medium">Path:</span> {worktree.path}
									</p>
								</div>
							</TooltipContent>
						</Tooltip>
					);
				})}
			</div>
		</div>
	);
};
