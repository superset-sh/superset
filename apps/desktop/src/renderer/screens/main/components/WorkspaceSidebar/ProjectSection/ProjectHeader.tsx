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
import { useMemo, useState } from "react";
import { HiChevronRight, HiMiniPlus } from "react-icons/hi2";
import {
	LuFolderOpen,
	LuImage,
	LuImageOff,
	LuListPlus,
	LuPalette,
	LuPencil,
	LuSettings,
	LuSquareArrowOutUpRight,
	LuX,
} from "react-icons/lu";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useUpdateProject } from "renderer/react-query/projects/useUpdateProject";
import { navigateToWorkspace } from "renderer/routes/_authenticated/_dashboard/utils/workspace-navigation";
import { useProjectRename } from "renderer/screens/main/hooks/useProjectRename";
import { useTabsStore } from "renderer/stores/tabs/store";
import { extractPaneIdsFromLayout } from "renderer/stores/tabs/utils";
import {
	PROJECT_COLOR_DEFAULT,
	PROJECT_COLORS,
} from "shared/constants/project-colors";
import { getHighestPriorityStatus } from "shared/tabs-types";
import { STROKE_WIDTH } from "../constants";
import { RenameInput } from "../RenameInput";
import { CloseProjectDialog } from "./CloseProjectDialog";
import { ProjectThumbnail } from "./ProjectThumbnail";

interface ProjectHeaderProps {
	projectId: string;
	projectName: string;
	projectColor: string;
	githubOwner: string | null;
	mainRepoPath: string;
	hideImage: boolean;
	iconUrl: string | null;
	/** Whether the project section is collapsed (workspaces hidden) */
	isCollapsed: boolean;
	/** Whether the sidebar is in collapsed mode (icon-only view) */
	isSidebarCollapsed?: boolean;
	onToggleCollapse: () => void;
	workspaceCount: number;
	onNewWorkspace: () => void;
	/** Whether this project has worktree-type workspaces on disk */
	hasWorktrees?: boolean;
	/** True when the project has only a single branch workspace (no worktrees) */
	isBranchOnly?: boolean;
	/** Branch name for inline display on branch-only projects */
	branchOnlyBranch?: string;
	/** Worktree path for diff stats on branch-only projects */
	branchOnlyWorktreePath?: string;
	/** Keyboard shortcut index for branch-only projects */
	shortcutIndex?: number;
	/** Workspace ID for branch-only status tracking */
	branchOnlyWorkspaceId?: string;
	/** Whether this branch-only project's workspace is currently active */
	isActive?: boolean;
	/** Called when clicking a branch-only project to navigate directly */
	onNavigateToWorkspace?: () => void;
	/** Extra context menu items rendered at the top of the menu */
	extraContextMenuItems?: React.ReactNode;
	/** Hide the "Open in Focus Window" context menu item */
	hideOpenInFocusWindow?: boolean;
}

export function ProjectHeader({
	projectId,
	projectName,
	projectColor,
	githubOwner,
	mainRepoPath,
	hideImage,
	iconUrl,
	isCollapsed,
	isSidebarCollapsed = false,
	onToggleCollapse,
	workspaceCount,
	onNewWorkspace,
	hasWorktrees = false,
	isBranchOnly = false,
	branchOnlyBranch,
	branchOnlyWorktreePath,
	shortcutIndex,
	branchOnlyWorkspaceId,
	isActive = false,
	onNavigateToWorkspace,
	extraContextMenuItems,
	hideOpenInFocusWindow,
}: ProjectHeaderProps) {
	const utils = electronTrpc.useUtils();
	const navigate = useNavigate();
	const params = useParams({ strict: false }) as { workspaceId?: string };
	const [isCloseDialogOpen, setIsCloseDialogOpen] = useState(false);
	const rename = useProjectRename(projectId, projectName);

	// Agent status for branch-only projects (pulsing ring around thumbnail)
	const branchOnlyStatus = useTabsStore((state) => {
		if (!branchOnlyWorkspaceId) return null;
		function* paneStatuses() {
			for (const tab of state.tabs) {
				if (tab.workspaceId !== branchOnlyWorkspaceId) continue;
				for (const paneId of extractPaneIdsFromLayout(tab.layout)) {
					yield state.panes[paneId]?.status;
				}
			}
		}
		return getHighestPriorityStatus(paneStatuses());
	});

	// Diff stats for branch-only inline display
	const { data: branchOnlyChanges } = electronTrpc.changes.getStatus.useQuery(
		{ worktreePath: branchOnlyWorktreePath ?? "" },
		{ enabled: isBranchOnly && !!branchOnlyWorktreePath, staleTime: 5000 },
	);
	const branchOnlyDiffStats = useMemo(() => {
		if (!branchOnlyChanges) return null;
		const files = [
			...branchOnlyChanges.staged,
			...branchOnlyChanges.unstaged,
			...branchOnlyChanges.untracked,
		];
		const additions = files.reduce((sum, f) => sum + (f.additions || 0), 0);
		const deletions = files.reduce((sum, f) => sum + (f.deletions || 0), 0);
		if (additions === 0 && deletions === 0) return null;
		return { additions, deletions };
	}, [branchOnlyChanges]);

	const closeProject = electronTrpc.projects.close.useMutation({
		onMutate: async ({ id }) => {
			let shouldNavigate = false;

			if (params.workspaceId) {
				try {
					const currentWorkspace = await utils.workspaces.get.fetch({
						id: params.workspaceId,
					});
					shouldNavigate = currentWorkspace?.projectId === id;
				} catch (error) {
					console.warn(
						"[ProjectHeader] Failed to resolve current workspace before closing project",
						error,
					);
				}
			}

			return { shouldNavigate };
		},
		onSuccess: async (data, { id }, context) => {
			utils.workspaces.getAllGrouped.invalidate();
			utils.projects.getRecents.invalidate();

			if (context?.shouldNavigate) {
				const groups = await utils.workspaces.getAllGrouped.fetch();
				const otherWorkspace = groups
					.flatMap((group) => group.workspaces)
					.find((w) => w.projectId !== id);

				if (otherWorkspace) {
					navigateToWorkspace(otherWorkspace.id, navigate);
				} else {
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

	const openInFinder = electronTrpc.external.openInFinder.useMutation({
		onError: (error) => toast.error(`Failed to open: ${error.message}`),
	});

	const openInNewWindow =
		electronTrpc.window.openProjectInNewWindow.useMutation({
			onError: (error) =>
				toast.error(`Failed to open in new window: ${error.message}`),
		});

	const handleCloseProject = () => {
		setIsCloseDialogOpen(true);
	};

	const handleConfirmClose = (options: { deleteWorktrees: boolean }) => {
		closeProject.mutate({
			id: projectId,
			deleteWorktrees: options.deleteWorktrees,
		});
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

	const handleToggleImage = () => {
		updateProject.mutate({ id: projectId, patch: { hideImage: !hideImage } });
	};

	const createSection = electronTrpc.workspaces.createSection.useMutation({
		onSuccess: () => utils.workspaces.getAllGrouped.invalidate(),
		onError: (error) =>
			toast.error(`Failed to create section: ${error.message}`),
	});

	const handleNewSection = () => {
		createSection.mutate({ projectId, name: "New Section" });
	};

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
										iconUrl={iconUrl}
										hideImage={hideImage}
									/>
								</button>
							</TooltipTrigger>
						</ContextMenuTrigger>
						<TooltipContent className="flex flex-col gap-0.5">
							<span className="font-medium">{projectName}</span>
							<span className="text-xs text-muted-foreground">
								{workspaceCount} workspace{workspaceCount !== 1 ? "s" : ""}
							</span>
						</TooltipContent>
					</Tooltip>
					<ContextMenuContent>
						{extraContextMenuItems}
						{extraContextMenuItems && <ContextMenuSeparator />}
						<ContextMenuItem onSelect={rename.startRename}>
							<LuPencil className="size-4 mr-2" strokeWidth={STROKE_WIDTH} />
							Rename
						</ContextMenuItem>
						<ContextMenuSeparator />
						<ContextMenuItem onSelect={handleOpenInFinder}>
							<LuFolderOpen
								className="size-4 mr-2"
								strokeWidth={STROKE_WIDTH}
							/>
							Open in Finder
						</ContextMenuItem>
						{!hideOpenInFocusWindow && (
							<ContextMenuItem
								onSelect={() => openInNewWindow.mutate({ projectId })}
							>
								<LuSquareArrowOutUpRight
									className="size-4 mr-2"
									strokeWidth={STROKE_WIDTH}
								/>
								Open in Focus Window
							</ContextMenuItem>
						)}
						<ContextMenuItem onSelect={handleOpenSettings}>
							<LuSettings className="size-4 mr-2" strokeWidth={STROKE_WIDTH} />
							Project Settings
						</ContextMenuItem>
						{colorPickerSubmenu}
						<ContextMenuItem onSelect={handleNewSection}>
							<LuListPlus className="size-4 mr-2" strokeWidth={STROKE_WIDTH} />
							New Section
						</ContextMenuItem>
						<ContextMenuSeparator />
						<ContextMenuItem
							onSelect={handleCloseProject}
							disabled={closeProject.isPending}
							className="text-destructive focus:text-destructive"
						>
							<LuX
								className="size-4 mr-2 text-destructive"
								strokeWidth={STROKE_WIDTH}
							/>
							{closeProject.isPending ? "Closing..." : "Close Project"}
						</ContextMenuItem>
					</ContextMenuContent>
				</ContextMenu>

				<CloseProjectDialog
					projectName={projectName}
					workspaceCount={workspaceCount}
					hasWorktrees={hasWorktrees}
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
							"group flex items-center w-full pl-3 pr-2 py-1.5 text-sm font-medium",
							"hover:bg-muted/50 transition-colors",
							isBranchOnly && isActive && "bg-muted",
						)}
					>
						{rename.isRenaming ? (
							<div className="flex items-center gap-2 flex-1 min-w-0 py-0.5">
								<ProjectThumbnail
									projectId={projectId}
									projectName={projectName}
									projectColor={projectColor}
									githubOwner={githubOwner}
									hideImage={hideImage}
									iconUrl={iconUrl}
								/>
								<RenameInput
									value={rename.renameValue}
									onChange={rename.setRenameValue}
									onSubmit={rename.submitRename}
									onCancel={rename.cancelRename}
									className="h-6 px-1 py-0 text-sm -ml-1 font-medium bg-transparent border-none outline-none flex-1 min-w-0"
								/>
							</div>
						) : (
							<button
								type="button"
								onClick={
									isBranchOnly ? onNavigateToWorkspace : onToggleCollapse
								}
								onDoubleClick={rename.startRename}
								className={cn(
									"flex flex-1 min-w-0 py-0.5 text-left cursor-pointer",
									isBranchOnly ? "flex-col gap-0.5" : "items-center gap-2",
								)}
							>
								<div className="flex items-center gap-2 min-w-0 w-full">
									<div
										className={cn(
											"relative rounded shrink-0",
											branchOnlyStatus === "working" &&
												"ring-2 ring-amber-500/70 animate-pulse",
											branchOnlyStatus === "permission" &&
												"ring-2 ring-red-500/70 animate-pulse",
											branchOnlyStatus === "review" &&
												"ring-2 ring-green-500/70",
										)}
									>
										<ProjectThumbnail
											projectId={projectId}
											projectName={projectName}
											projectColor={projectColor}
											githubOwner={githubOwner}
											hideImage={hideImage}
											iconUrl={iconUrl}
										/>
									</div>
									<span className="truncate">{projectName}</span>
									{!isBranchOnly && (
										<span className="flex h-5 shrink-0 items-center rounded px-1.5 text-[10px] font-mono tabular-nums bg-muted/50 text-muted-foreground">
											{workspaceCount}
										</span>
									)}
									{isBranchOnly && (
										<div className="grid shrink-0 h-5 [&>*]:col-start-1 [&>*]:row-start-1 items-center ml-auto">
											{branchOnlyDiffStats && (
												<div
													className={cn(
														"flex h-5 items-center rounded px-1.5 text-[10px] font-mono tabular-nums transition-[opacity,visibility] group-hover:opacity-0 group-hover:invisible",
														isActive ? "bg-foreground/10" : "bg-muted/50",
													)}
												>
													<div className="flex items-center gap-1.5 leading-none">
														<span className="text-emerald-500/90">
															+{branchOnlyDiffStats.additions}
														</span>
														<span className="text-red-400/90">
															-{branchOnlyDiffStats.deletions}
														</span>
													</div>
												</div>
											)}
											<div className="flex items-center justify-end opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-[opacity,visibility]">
												{shortcutIndex !== undefined && shortcutIndex < 9 && (
													<span className="text-[10px] text-muted-foreground font-mono tabular-nums shrink-0">
														⌘{shortcutIndex + 1}
													</span>
												)}
											</div>
										</div>
									)}
								</div>
								{isBranchOnly && branchOnlyBranch && (
									<span className="text-[11px] text-muted-foreground/60 font-mono leading-tight pl-7 truncate">
										{branchOnlyBranch}
									</span>
								)}
							</button>
						)}

						{!isBranchOnly && (
							<>
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
							</>
						)}
					</div>
				</ContextMenuTrigger>
				<ContextMenuContent>
					{extraContextMenuItems}
					{extraContextMenuItems && <ContextMenuSeparator />}
					<ContextMenuItem onSelect={rename.startRename}>
						<LuPencil className="size-4 mr-2" strokeWidth={STROKE_WIDTH} />
						Rename
					</ContextMenuItem>
					<ContextMenuSeparator />
					<ContextMenuItem onSelect={handleOpenInFinder}>
						<LuFolderOpen className="size-4 mr-2" strokeWidth={STROKE_WIDTH} />
						Open in Finder
					</ContextMenuItem>
					{!hideOpenInFocusWindow && (
						<ContextMenuItem
							onSelect={() => openInNewWindow.mutate({ projectId })}
						>
							<LuSquareArrowOutUpRight
								className="size-4 mr-2"
								strokeWidth={STROKE_WIDTH}
							/>
							Open in Focus Window
						</ContextMenuItem>
					)}
					<ContextMenuItem onSelect={handleOpenSettings}>
						<LuSettings className="size-4 mr-2" strokeWidth={STROKE_WIDTH} />
						Project Settings
					</ContextMenuItem>
					{colorPickerSubmenu}
					<ContextMenuItem onSelect={handleToggleImage}>
						{hideImage ? (
							<LuImage className="size-4 mr-2" strokeWidth={STROKE_WIDTH} />
						) : (
							<LuImageOff className="size-4 mr-2" strokeWidth={STROKE_WIDTH} />
						)}
						{hideImage ? "Show Image" : "Hide Image"}
					</ContextMenuItem>
					<ContextMenuItem onSelect={handleNewSection}>
						<LuListPlus className="size-4 mr-2" strokeWidth={STROKE_WIDTH} />
						New Section
					</ContextMenuItem>
					<ContextMenuSeparator />
					<ContextMenuItem
						onSelect={handleCloseProject}
						disabled={closeProject.isPending}
						className="text-destructive focus:text-destructive"
					>
						<LuX
							className="size-4 mr-2 text-destructive"
							strokeWidth={STROKE_WIDTH}
						/>
						{closeProject.isPending ? "Closing..." : "Close Project"}
					</ContextMenuItem>
				</ContextMenuContent>
			</ContextMenu>

			<CloseProjectDialog
				projectName={projectName}
				workspaceCount={workspaceCount}
				hasWorktrees={hasWorktrees}
				open={isCloseDialogOpen}
				onOpenChange={setIsCloseDialogOpen}
				onConfirm={handleConfirmClose}
			/>
		</>
	);
}
