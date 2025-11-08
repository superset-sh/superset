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
			className="flex items-end select-none bg-black/20 border-b border-neutral-700 pl-[88px]"
			style={
				{
					WebkitAppRegion: "drag",
				} as React.CSSProperties
			}
		>
			<div
				className="flex items-center gap-1 px-2 h-full w-full"
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

				<div className="flex items-end gap-1 px-2 h-full w-fulloverflow-x-auto">
					{/* Worktree tabs */}
					{worktrees.map((worktree) => {
						// Use description as title if available, otherwise use branch name
						const displayTitle = worktree.description || worktree.branch;

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

						return (
							<HoverCard key={worktree.id} openDelay={200}>
								<HoverCardTrigger asChild>
									<button
										type="button"
										onClick={() => onWorktreeSelect(worktree.id)}
										className={`
										flex items-center gap-2 px-3 h-8 rounded-t-md transition-all border-t border-x
										${selectedWorktreeId === worktree.id
												? "bg-neutral-900 text-white border-neutral-700 -mb-px"
												: "bg-neutral-800/50 text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800 border-transparent"
											}
									`}
									>
										{/* Status indicator dot */}
										<div className="relative" style={{ width: 8, height: 8 }}>
											<svg
												width={8}
												height={8}
												viewBox="0 0 8 8"
												role="img"
												aria-label="Worktree status indicator"
											>
												<circle cx={4} cy={4} r={4} fill={statusColor} />
											</svg>
											{hasPorts && (
												<>
													<span
														className="absolute inset-0 rounded-full animate-ping opacity-75"
														style={{ backgroundColor: statusColor }}
													/>
													<span
														className="absolute inset-0 rounded-full"
														style={{ backgroundColor: statusColor }}
													/>
												</>
											)}
										</div>
										<span className="text-sm whitespace-nowrap max-w-[200px] truncate">
											{displayTitle}
										</span>
									</button>
								</HoverCardTrigger>
								<HoverCardContent side="bottom" align="start" className="w-96">
									<div className="space-y-3">
										{/* Header with title */}
										<div className="flex items-start justify-between gap-3">
											<div className="flex-1 min-w-0">
												{worktree.description ? (
													<>
														<h4 className="font-semibold text-sm text-white">
															{worktree.description}
														</h4>
														<p className="text-xs text-neutral-400 mt-1.5 leading-relaxed">
															Branch: {worktree.branch}
														</p>
													</>
												) : (
													<h4 className="font-semibold text-sm text-white">
														{worktree.branch}
													</h4>
												)}
											</div>
										</div>

										{/* Metadata grid */}
										<div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs pt-2 border-t border-neutral-800">
											<div className="flex items-center gap-2">
												<span className="text-neutral-500">Status</span>
												<div className="flex items-center gap-1.5">
													<div
														className="relative"
														style={{ width: 8, height: 8 }}
													>
														<svg
															width={8}
															height={8}
															viewBox="0 0 8 8"
															role="img"
															aria-label="Status indicator"
														>
															<circle cx={4} cy={4} r={4} fill={statusColor} />
														</svg>
													</div>
													<span className="text-neutral-300">
														{hasPorts
															? "Running"
															: hasActivity
																? "Active"
																: "Inactive"}
													</span>
												</div>
											</div>

											{worktree.tabs && worktree.tabs.length > 0 && (
												<div className="flex items-center gap-2">
													<span className="text-neutral-500">Tabs</span>
													<span className="text-neutral-300">
														{worktree.tabs.length}
													</span>
												</div>
											)}

											{!worktree.description && (
												<div className="flex items-center gap-2 col-span-2">
													<span className="text-neutral-500">Branch</span>
													<span className="text-neutral-300 font-mono text-xs truncate">
														{worktree.branch}
													</span>
												</div>
											)}

											<div className="flex items-center gap-2 col-span-2">
												<span className="text-neutral-500">Path</span>
												<span className="text-neutral-300 font-mono text-xs truncate">
													{worktree.path}
												</span>
											</div>
										</div>
									</div>
								</HoverCardContent>
							</HoverCard>
						);
					})}
				</div>
			</div>
		</div>
	);
};
