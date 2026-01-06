import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuSeparator,
	ContextMenuTrigger,
} from "@superset/ui/context-menu";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { toast } from "@superset/ui/sonner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import { HiChevronRight, HiMiniPlus, HiOutlineBolt } from "react-icons/hi2";
import { LuFolderOpen, LuSettings, LuX } from "react-icons/lu";
import { trpc } from "renderer/lib/trpc";
import { useOpenSettings } from "renderer/stores/app-state";
import { STROKE_WIDTH } from "../constants";
import { ProjectThumbnail } from "./ProjectThumbnail";

interface ProjectHeaderProps {
	projectId: string;
	projectName: string;
	githubOwner: string | null;
	mainRepoPath: string;
	/** Whether the project section is collapsed (workspaces hidden) */
	isCollapsed: boolean;
	/** Whether the sidebar is in collapsed mode (icon-only view) */
	isSidebarCollapsed?: boolean;
	onToggleCollapse: () => void;
	workspaceCount: number;
	onNewWorkspace: () => void;
	onQuickCreate: () => void;
	isCreating: boolean;
	dropdownOpen: boolean;
	onDropdownOpenChange: (open: boolean) => void;
}

export function ProjectHeader({
	projectId,
	projectName,
	githubOwner,
	mainRepoPath,
	isCollapsed,
	isSidebarCollapsed = false,
	onToggleCollapse,
	workspaceCount,
	onNewWorkspace,
	onQuickCreate,
	isCreating,
	dropdownOpen,
	onDropdownOpenChange,
}: ProjectHeaderProps) {
	const utils = trpc.useUtils();
	const openSettings = useOpenSettings();

	const closeProject = trpc.projects.close.useMutation({
		onSuccess: (data) => {
			utils.workspaces.getAllGrouped.invalidate();
			utils.workspaces.getActive.invalidate();
			utils.projects.getRecents.invalidate();
			if (data.terminalWarning) {
				toast.warning(data.terminalWarning);
			}
		},
		onError: (error) => {
			toast.error(`Failed to close project: ${error.message}`);
		},
	});

	const openInFinder = trpc.external.openInFinder.useMutation({
		onError: (error) => toast.error(`Failed to open: ${error.message}`),
	});

	const handleCloseProject = () => {
		closeProject.mutate({ id: projectId });
	};

	const handleOpenInFinder = () => {
		openInFinder.mutate(mainRepoPath);
	};

	const handleOpenSettings = () => {
		openSettings("project");
	};

	// Collapsed sidebar: show just the thumbnail with tooltip and context menu
	if (isSidebarCollapsed) {
		return (
			<ContextMenu>
				<Tooltip delayDuration={300}>
					<ContextMenuTrigger asChild>
						<TooltipTrigger asChild>
							<button
								type="button"
								onClick={onToggleCollapse}
								className={cn(
									"flex items-center justify-center size-8 rounded-md",
									"hover:bg-muted/50 transition-colors",
								)}
							>
								<ProjectThumbnail
									projectId={projectId}
									projectName={projectName}
									githubOwner={githubOwner}
								/>
							</button>
						</TooltipTrigger>
					</ContextMenuTrigger>
					<TooltipContent side="right" className="flex flex-col gap-0.5">
						<span className="font-medium">{projectName}</span>
						<span className="text-xs text-muted-foreground">
							{workspaceCount} workspace{workspaceCount !== 1 ? "s" : ""}
						</span>
					</TooltipContent>
				</Tooltip>
				<ContextMenuContent>
					<ContextMenuItem onSelect={handleOpenInFinder}>
						<LuFolderOpen className="size-4 mr-2" strokeWidth={STROKE_WIDTH} />
						Open in Finder
					</ContextMenuItem>
					<ContextMenuItem onSelect={handleOpenSettings}>
						<LuSettings className="size-4 mr-2" strokeWidth={STROKE_WIDTH} />
						Project Settings
					</ContextMenuItem>
					<ContextMenuSeparator />
					<ContextMenuItem
						onSelect={handleCloseProject}
						disabled={closeProject.isPending}
						className="text-destructive focus:text-destructive"
					>
						<LuX className="size-4 mr-2" strokeWidth={STROKE_WIDTH} />
						{closeProject.isPending ? "Closing..." : "Close Project"}
					</ContextMenuItem>
				</ContextMenuContent>
			</ContextMenu>
		);
	}

	return (
		<ContextMenu>
			<ContextMenuTrigger asChild>
				<div
					className={cn(
						"flex items-center w-full pl-3 pr-2 py-1.5 text-sm font-medium",
						"hover:bg-muted/50 transition-colors",
					)}
				>
					{/* Main clickable area */}
					<button
						type="button"
						onClick={onToggleCollapse}
						className="flex items-center gap-2 flex-1 min-w-0 py-0.5 text-left cursor-pointer"
					>
						<ProjectThumbnail
							projectId={projectId}
							projectName={projectName}
							githubOwner={githubOwner}
						/>
						<span className="truncate">{projectName}</span>
						<span className="text-xs text-muted-foreground tabular-nums">
							({workspaceCount})
						</span>
					</button>

					{/* Add workspace button */}
					<div className="relative shrink-0 ml-1">
						<DropdownMenu
							open={dropdownOpen}
							onOpenChange={onDropdownOpenChange}
						>
							<Tooltip delayDuration={500}>
								<TooltipTrigger asChild>
									<DropdownMenuTrigger asChild>
										<button
											type="button"
											disabled={isCreating}
											onClick={(e) => e.stopPropagation()}
											onContextMenu={(e) => e.stopPropagation()}
											className={cn(
												"p-1 rounded hover:bg-muted transition-colors",
												dropdownOpen && "bg-muted",
											)}
										>
											<HiMiniPlus className="size-4 text-muted-foreground" />
										</button>
									</DropdownMenuTrigger>
								</TooltipTrigger>
								<TooltipContent side="bottom" sideOffset={4}>
									Add workspace
								</TooltipContent>
							</Tooltip>
							<DropdownMenuContent
								align="end"
								sideOffset={4}
								className="w-44 rounded-lg border-border/40 bg-popover/95 p-1 shadow-lg backdrop-blur-sm"
								onClick={(e) => e.stopPropagation()}
							>
								<DropdownMenuItem
									onClick={onNewWorkspace}
									className="rounded-md text-[13px]"
								>
									<HiMiniPlus className="size-[14px] opacity-60" />
									New Workspace
								</DropdownMenuItem>
								<DropdownMenuItem
									onClick={onQuickCreate}
									disabled={isCreating}
									className="rounded-md text-[13px]"
								>
									<HiOutlineBolt className="size-[14px] opacity-60" />
									Quick Create
								</DropdownMenuItem>
							</DropdownMenuContent>
						</DropdownMenu>
					</div>

					{/* Collapse chevron */}
					<button
						type="button"
						onClick={onToggleCollapse}
						onContextMenu={(e) => e.stopPropagation()}
						aria-expanded={!isCollapsed}
						className="p-1 rounded hover:bg-muted transition-colors shrink-0 ml-1"
					>
						<HiChevronRight
							className={cn(
								"size-3.5 text-muted-foreground transition-transform duration-150",
								isCollapsed ? "rotate-180" : "rotate-90",
							)}
						/>
					</button>
				</div>
			</ContextMenuTrigger>
			<ContextMenuContent>
				<ContextMenuItem onSelect={handleOpenInFinder}>
					<LuFolderOpen className="size-4 mr-2" strokeWidth={STROKE_WIDTH} />
					Open in Finder
				</ContextMenuItem>
				<ContextMenuItem onSelect={handleOpenSettings}>
					<LuSettings className="size-4 mr-2" strokeWidth={STROKE_WIDTH} />
					Project Settings
				</ContextMenuItem>
				<ContextMenuSeparator />
				<ContextMenuItem
					onSelect={handleCloseProject}
					disabled={closeProject.isPending}
					className="text-destructive focus:text-destructive"
				>
					<LuX className="size-4 mr-2" strokeWidth={STROKE_WIDTH} />
					{closeProject.isPending ? "Closing..." : "Close Project"}
				</ContextMenuItem>
			</ContextMenuContent>
		</ContextMenu>
	);
}
