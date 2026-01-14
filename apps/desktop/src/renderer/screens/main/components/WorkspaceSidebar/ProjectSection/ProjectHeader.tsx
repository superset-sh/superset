import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuSeparator,
	ContextMenuSub,
	ContextMenuSubContent,
	ContextMenuSubTrigger,
	ContextMenuTrigger,
} from "@superset/ui/context-menu";
import { toast } from "@superset/ui/sonner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import { useNavigate, useParams } from "@tanstack/react-router";
import { useState } from "react";
import { HiChevronRight, HiMiniPlus } from "react-icons/hi2";
import { LuFolderOpen, LuPalette, LuSettings, LuX } from "react-icons/lu";
import { trpc } from "renderer/lib/trpc";
import { useUpdateProject } from "renderer/react-query/projects/useUpdateProject";
import { navigateToWorkspace } from "renderer/routes/_authenticated/_dashboard/utils/workspace-navigation";
import {
	PROJECT_COLOR_DEFAULT,
	PROJECT_COLORS,
} from "shared/constants/project-colors";
import { STROKE_WIDTH } from "../constants";
import { CloseProjectDialog } from "./CloseProjectDialog";
import { ProjectThumbnail } from "./ProjectThumbnail";

interface ProjectHeaderProps {
	projectId: string;
	projectName: string;
	projectColor: string;
	githubOwner: string | null;
	mainRepoPath: string;
	/** Whether the project section is collapsed (workspaces hidden) */
	isCollapsed: boolean;
	/** Whether the sidebar is in collapsed mode (icon-only view) */
	isSidebarCollapsed?: boolean;
	onToggleCollapse: () => void;
	workspaceCount: number;
	onNewWorkspace: () => void;
}

export function ProjectHeader({
	projectId,
	projectName,
	projectColor,
	githubOwner,
	mainRepoPath,
	isCollapsed,
	isSidebarCollapsed = false,
	onToggleCollapse,
	workspaceCount,
	onNewWorkspace,
}: ProjectHeaderProps) {
	const utils = trpc.useUtils();
	const navigate = useNavigate();
	const params = useParams({ strict: false }) as { workspaceId?: string };
	const [isCloseDialogOpen, setIsCloseDialogOpen] = useState(false);

	const closeProject = trpc.projects.close.useMutation({
		onMutate: async ({ id }) => {
			// Check if we're viewing a workspace from this project BEFORE closing
			let shouldNavigate = false;

			if (params.workspaceId) {
				try {
					const currentWorkspace = await utils.workspaces.get.fetch({
						id: params.workspaceId,
					});
					shouldNavigate = currentWorkspace?.projectId === id;
				} catch {
					// Workspace might not exist, skip navigation
				}
			}

			return { shouldNavigate };
		},
		onSuccess: async (data, { id }, context) => {
			utils.workspaces.getAllGrouped.invalidate();
			utils.projects.getRecents.invalidate();

			// Navigate away if we were viewing a workspace from the closed project
			if (context?.shouldNavigate) {
				// Find a workspace from a different project to navigate to
				const groups = await utils.workspaces.getAllGrouped.fetch();
				const otherWorkspace = groups
					.flatMap((group) => group.workspaces)
					.find((w) => w.projectId !== id);

				if (otherWorkspace) {
					navigateToWorkspace(otherWorkspace.id, navigate);
				} else {
					// No other workspaces exist - go to workspace index
					navigate({ to: "/workspace" });
				}
			}

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
		setIsCloseDialogOpen(true);
	};

	const handleConfirmClose = () => {
		closeProject.mutate({ id: projectId });
	};

	const handleOpenInFinder = () => {
		openInFinder.mutate(mainRepoPath);
	};

	const handleOpenSettings = () => {
		navigate({ to: "/settings/project/$projectId", params: { projectId } });
	};

	const updateProject = useUpdateProject({
		onError: (error) => toast.error(`Failed to update color: ${error.message}`),
	});

	const handleColorChange = (color: string) => {
		updateProject.mutate({ id: projectId, patch: { color } });
	};

	// Color picker submenu used in both collapsed and expanded context menus
	const colorPickerSubmenu = (
		<ContextMenuSub>
			<ContextMenuSubTrigger>
				<LuPalette className="size-4 mr-2" strokeWidth={STROKE_WIDTH} />
				Set Color
			</ContextMenuSubTrigger>
			<ContextMenuSubContent className="w-36">
				{PROJECT_COLORS.map((color) => {
					const isDefault = color.value === PROJECT_COLOR_DEFAULT;
					return (
						<ContextMenuItem
							key={color.value}
							onSelect={() => handleColorChange(color.value)}
							className="flex items-center gap-2"
						>
							<span
								className={cn(
									"size-3 rounded-full border",
									isDefault ? "border-border bg-muted" : "border-border/50",
								)}
								style={isDefault ? undefined : { backgroundColor: color.value }}
							/>
							<span>{color.name}</span>
							{projectColor === color.value && (
								<span className="ml-auto text-xs text-muted-foreground">✓</span>
							)}
						</ContextMenuItem>
					);
				})}
			</ContextMenuSubContent>
		</ContextMenuSub>
	);

	// Collapsed sidebar: show just the thumbnail with tooltip and context menu
	if (isSidebarCollapsed) {
		return (
			<>
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
										projectColor={projectColor}
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
							<LuFolderOpen
								className="size-4 mr-2"
								strokeWidth={STROKE_WIDTH}
							/>
							Open in Finder
						</ContextMenuItem>
						<ContextMenuItem onSelect={handleOpenSettings}>
							<LuSettings className="size-4 mr-2" strokeWidth={STROKE_WIDTH} />
							Project Settings
						</ContextMenuItem>
						{colorPickerSubmenu}
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

				<CloseProjectDialog
					projectName={projectName}
					workspaceCount={workspaceCount}
					open={isCloseDialogOpen}
					onOpenChange={setIsCloseDialogOpen}
					onConfirm={handleConfirmClose}
				/>
			</>
		);
	}

	return (
		<>
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
								projectColor={projectColor}
								githubOwner={githubOwner}
							/>
							<span className="truncate">{projectName}</span>
							<span className="text-xs text-muted-foreground tabular-nums">
								({workspaceCount})
							</span>
						</button>

						{/* Add workspace button */}
						<Tooltip delayDuration={500}>
							<TooltipTrigger asChild>
								<button
									type="button"
									onClick={(e) => {
										e.stopPropagation();
										onNewWorkspace();
									}}
									onContextMenu={(e) => e.stopPropagation()}
									className="p-1 rounded hover:bg-muted transition-colors shrink-0 ml-1"
								>
									<HiMiniPlus className="size-4 text-muted-foreground" />
								</button>
							</TooltipTrigger>
							<TooltipContent side="bottom" sideOffset={4}>
								New workspace
							</TooltipContent>
						</Tooltip>

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
									!isCollapsed && "rotate-90",
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
					{colorPickerSubmenu}
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

			<CloseProjectDialog
				projectName={projectName}
				workspaceCount={workspaceCount}
				open={isCloseDialogOpen}
				onOpenChange={setIsCloseDialogOpen}
				onConfirm={handleConfirmClose}
			/>
		</>
	);
}
