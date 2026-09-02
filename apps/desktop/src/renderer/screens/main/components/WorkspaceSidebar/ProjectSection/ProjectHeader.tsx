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
import {
	LuFolderOpen,
	LuImage,
	LuImageOff,
	LuListPlus,
	LuPalette,
	LuPencil,
	LuSettings,
	LuX,
} from "react-icons/lu";
import { ColorSelector } from "renderer/components/ColorSelector";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useUpdateProject } from "renderer/react-query/projects/useUpdateProject";
import { removeProjectFromGroups } from "renderer/react-query/workspaces/utils/workspace-removal";
import { navigateToWorkspace } from "renderer/routes/_authenticated/_dashboard/utils/workspace-navigation";
import { useProjectRename } from "renderer/screens/main/hooks/useProjectRename";
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
}

type CloseProjectContext = {
	previousWorkspaceId?: string;
	previousGrouped?: ReturnType<
		typeof electronTrpc.useUtils
	>["workspaces"]["getAllGrouped"]["getData"] extends () => infer R
		? R
		: never;
};

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
}: ProjectHeaderProps) {
	const utils = electronTrpc.useUtils();
	const navigate = useNavigate();
	const params = useParams({ strict: false }) as { workspaceId?: string };
	const [isCloseDialogOpen, setIsCloseDialogOpen] = useState(false);
	const rename = useProjectRename(projectId, projectName);

	const closeProject = electronTrpc.projects.close.useMutation({
		onMutate: async ({ id }) => {
			const workspaceId = params.workspaceId;
			if (!workspaceId) return {};

			const currentWorkspace = await utils.workspaces.get
				.fetch({
					id: workspaceId,
				})
				.catch((error) => {
					console.warn(
						"[ProjectHeader] Failed to resolve current workspace before closing project",
						error,
					);
					throw error;
				});

			if (currentWorkspace?.projectId !== id) return {};

			await utils.workspaces.getAllGrouped.cancel();
			const previousGrouped =
				utils.workspaces.getAllGrouped.getData() ??
				(await utils.workspaces.getAllGrouped.fetch());
			utils.workspaces.getAllGrouped.setData(
				undefined,
				removeProjectFromGroups(previousGrouped, id),
			);

			const previousLastViewedWorkspaceId = localStorage.getItem(
				"lastViewedWorkspaceId",
			);
			const shouldClearLastViewedWorkspace = previousGrouped.some(
				(group) =>
					group.project.id === id &&
					(group.workspaces.some(
						(workspace) => workspace.id === previousLastViewedWorkspaceId,
					) ||
						group.sections.some((section) =>
							section.workspaces.some(
								(workspace) => workspace.id === previousLastViewedWorkspaceId,
							),
						)),
			);
			if (shouldClearLastViewedWorkspace) {
				localStorage.removeItem("lastViewedWorkspaceId");
			}

			// The workspace route cannot render after this mutation deletes it.
			try {
				await navigate({ to: "/workspace" });
			} catch (error) {
				utils.workspaces.getAllGrouped.setData(undefined, previousGrouped);
				if (previousLastViewedWorkspaceId) {
					localStorage.setItem(
						"lastViewedWorkspaceId",
						previousLastViewedWorkspaceId,
					);
				}
				throw error;
			}

			return { previousWorkspaceId: workspaceId, previousGrouped };
		},
		onSuccess: (data) => {
			utils.workspaces.getAllGrouped.invalidate();
			utils.projects.getRecents.invalidate();

			if (data.terminalWarning) {
				toast.warning(data.terminalWarning);
			}
		},
		onError: (error, _variables, context: CloseProjectContext | undefined) => {
			if (context?.previousGrouped !== undefined) {
				utils.workspaces.getAllGrouped.setData(
					undefined,
					context.previousGrouped,
				);
			}
			if (context?.previousWorkspaceId) {
				void navigateToWorkspace(
					context.previousWorkspaceId,
					navigate,
				).catch((navigationError) => {
					console.error(
						"[ProjectHeader] Failed to restore workspace after closing project failed",
						navigationError,
					);
				});
			}
			toast.error(`Failed to close project: ${error.message}`);
		},
	});

	const openInFinder = electronTrpc.external.openInFinder.useMutation({
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
		navigate({ to: "/settings/projects/$projectId", params: { projectId } });
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
			<ContextMenuSubContent className="w-40 max-h-80 overflow-y-auto">
				<ColorSelector
					variant="menu"
					selectedColor={projectColor}
					onSelectColor={handleColorChange}
				/>
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
										"hover:bg-fill-hover transition-colors",
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
							"hover:bg-fill-hover transition-colors",
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
								onClick={onToggleCollapse}
								onDoubleClick={rename.startRename}
								className="flex items-center gap-2 flex-1 min-w-0 py-0.5 text-left cursor-pointer"
							>
								<ProjectThumbnail
									projectId={projectId}
									projectName={projectName}
									projectColor={projectColor}
									githubOwner={githubOwner}
									hideImage={hideImage}
									iconUrl={iconUrl}
								/>
								<span className="truncate">{projectName}</span>
								<span className="text-xs text-muted-foreground tabular-nums font-normal">
									({workspaceCount})
								</span>
							</button>
						)}

						<Tooltip delayDuration={500}>
							<TooltipTrigger asChild>
								<button
									type="button"
									onClick={(e) => {
										e.stopPropagation();
										onNewWorkspace();
									}}
									onContextMenu={(e) => e.stopPropagation()}
									className="p-1 rounded hover:bg-fill-hover transition-colors shrink-0 ml-1"
								>
									<HiMiniPlus className="size-4 text-muted-foreground" />
								</button>
							</TooltipTrigger>
							<TooltipContent side="bottom">New workspace</TooltipContent>
						</Tooltip>

						<button
							type="button"
							onClick={onToggleCollapse}
							onContextMenu={(e) => e.stopPropagation()}
							aria-expanded={!isCollapsed}
							className="p-1 rounded hover:bg-fill-hover transition-colors shrink-0 ml-1"
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
					<ContextMenuItem onSelect={rename.startRename}>
						<LuPencil className="size-4 mr-2" strokeWidth={STROKE_WIDTH} />
						Rename
					</ContextMenuItem>
					<ContextMenuSeparator />
					<ContextMenuItem onSelect={handleOpenInFinder}>
						<LuFolderOpen className="size-4 mr-2" strokeWidth={STROKE_WIDTH} />
						Open in Finder
					</ContextMenuItem>
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
				open={isCloseDialogOpen}
				onOpenChange={setIsCloseDialogOpen}
				onConfirm={handleConfirmClose}
			/>
		</>
	);
}
