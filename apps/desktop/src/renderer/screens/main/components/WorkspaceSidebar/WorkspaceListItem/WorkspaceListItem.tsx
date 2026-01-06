import { Button } from "@superset/ui/button";
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuSeparator,
	ContextMenuTrigger,
} from "@superset/ui/context-menu";
import {
	HoverCard,
	HoverCardContent,
	HoverCardTrigger,
} from "@superset/ui/hover-card";
import { Input } from "@superset/ui/input";
import { toast } from "@superset/ui/sonner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import { useMemo, useState } from "react";
import { useDrag, useDrop } from "react-dnd";
import { HiMiniXMark } from "react-icons/hi2";
import { LuEye, LuEyeOff, LuFolder, LuFolderGit2 } from "react-icons/lu";
import { trpc } from "renderer/lib/trpc";
import {
	useReorderWorkspaces,
	useSetActiveWorkspace,
	useWorkspaceDeleteHandler,
} from "renderer/react-query/workspaces";
import { StatusIndicator } from "renderer/screens/main/components/StatusIndicator";
import { useWorkspaceRename } from "renderer/screens/main/hooks/useWorkspaceRename";
import { useCloseWorkspacesList } from "renderer/stores/app-state";
import { useTabsStore } from "renderer/stores/tabs/store";
import { extractPaneIdsFromLayout } from "renderer/stores/tabs/utils";
import { getHighestPriorityStatus } from "shared/tabs-types";
import { STROKE_WIDTH } from "../constants";
import {
	BranchSwitcher,
	DeleteWorkspaceDialog,
	WorkspaceHoverCardContent,
} from "./components";
import {
	GITHUB_STATUS_STALE_TIME,
	HOVER_CARD_CLOSE_DELAY,
	HOVER_CARD_OPEN_DELAY,
	MAX_KEYBOARD_SHORTCUT_INDEX,
} from "./constants";
import { WorkspaceDiffStats } from "./WorkspaceDiffStats";
import { WorkspaceStatusBadge } from "./WorkspaceStatusBadge";

const WORKSPACE_TYPE = "WORKSPACE";

interface WorkspaceListItemProps {
	id: string;
	projectId: string;
	worktreePath: string;
	name: string;
	branch: string;
	type: "worktree" | "branch";
	isActive: boolean;
	isUnread?: boolean;
	index: number;
	shortcutIndex?: number;
	/** Whether the sidebar is in collapsed mode (icon-only view) */
	isCollapsed?: boolean;
}

export function WorkspaceListItem({
	id,
	projectId,
	worktreePath,
	name,
	branch,
	type,
	isActive,
	isUnread = false,
	index,
	shortcutIndex,
	isCollapsed = false,
}: WorkspaceListItemProps) {
	const isBranchWorkspace = type === "branch";
	const setActiveWorkspace = useSetActiveWorkspace();
	const reorderWorkspaces = useReorderWorkspaces();
	const closeWorkspacesList = useCloseWorkspacesList();
	const [hasHovered, setHasHovered] = useState(false);
	const rename = useWorkspaceRename(id, name);
	const tabs = useTabsStore((s) => s.tabs);
	const panes = useTabsStore((s) => s.panes);
	const clearWorkspaceAttentionStatus = useTabsStore(
		(s) => s.clearWorkspaceAttentionStatus,
	);
	const utils = trpc.useUtils();
	const openInFinder = trpc.external.openInFinder.useMutation({
		onError: (error) => toast.error(`Failed to open: ${error.message}`),
	});
	const setUnread = trpc.workspaces.setUnread.useMutation({
		onSuccess: () => {
			utils.workspaces.getAllGrouped.invalidate();
		},
		onError: (error) =>
			toast.error(`Failed to update unread status: ${error.message}`),
	});

	// Shared delete logic
	const { showDeleteDialog, setShowDeleteDialog, handleDeleteClick } =
		useWorkspaceDeleteHandler();

	// Lazy-load GitHub status on hover to avoid N+1 queries
	const { data: githubStatus } = trpc.workspaces.getGitHubStatus.useQuery(
		{ workspaceId: id },
		{
			enabled: hasHovered && type === "worktree",
			staleTime: GITHUB_STATUS_STALE_TIME,
		},
	);

	// Memoize workspace pane IDs to avoid recalculating on every render
	const workspacePaneIds = useMemo(() => {
		const workspaceTabs = tabs.filter((t) => t.workspaceId === id);
		return new Set(
			workspaceTabs.flatMap((t) => extractPaneIdsFromLayout(t.layout)),
		);
	}, [tabs, id]);

	// Compute aggregate status for workspace using shared priority logic
	const workspaceStatus = useMemo(() => {
		// Generator avoids array allocation
		function* paneStatuses() {
			for (const paneId of workspacePaneIds) {
				yield panes[paneId]?.status;
			}
		}
		return getHighestPriorityStatus(paneStatuses());
	}, [panes, workspacePaneIds]);

	const handleClick = () => {
		if (!rename.isRenaming) {
			setActiveWorkspace.mutate({ id });
			clearWorkspaceAttentionStatus(id);
			// Close workspaces list view if open, to show the workspace's terminal view
			closeWorkspacesList();
		}
	};

	const handleMouseEnter = () => {
		if (!hasHovered) {
			setHasHovered(true);
		}
	};

	const handleOpenInFinder = () => {
		if (worktreePath) {
			openInFinder.mutate(worktreePath);
		}
	};

	const handleToggleUnread = () => {
		setUnread.mutate({ id, isUnread: !isUnread });
	};

	// Drag and drop
	const [{ isDragging }, drag] = useDrag(
		() => ({
			type: WORKSPACE_TYPE,
			item: { id, projectId, index },
			collect: (monitor) => ({
				isDragging: monitor.isDragging(),
			}),
		}),
		[id, projectId, index],
	);

	const [, drop] = useDrop({
		accept: WORKSPACE_TYPE,
		hover: (item: { id: string; projectId: string; index: number }) => {
			if (item.projectId === projectId && item.index !== index) {
				reorderWorkspaces.mutate(
					{
						projectId,
						fromIndex: item.index,
						toIndex: index,
					},
					{
						onError: (error) =>
							toast.error(`Failed to reorder workspace: ${error.message}`),
					},
				);
				item.index = index;
			}
		},
	});

	const pr = githubStatus?.pr;
	const showDiffStats = pr && (pr.additions > 0 || pr.deletions > 0);

	// Determine if we should show the branch subtitle
	const showBranchSubtitle =
		!isBranchWorkspace && name && name !== branch && !rename.isRenaming;

	// Collapsed sidebar: show just the icon with hover card (worktree) or tooltip (branch)
	if (isCollapsed) {
		const collapsedButton = (
			<button
				type="button"
				onClick={handleClick}
				onMouseEnter={handleMouseEnter}
				className={cn(
					"relative flex items-center justify-center size-8 rounded-md",
					"hover:bg-muted/50 transition-colors",
					isActive && "bg-muted",
				)}
			>
				{isBranchWorkspace ? (
					<LuFolder
						className={cn(
							"size-4",
							isActive ? "text-foreground" : "text-muted-foreground",
						)}
						strokeWidth={STROKE_WIDTH}
					/>
				) : (
					<LuFolderGit2
						className={cn(
							"size-4",
							isActive ? "text-foreground" : "text-muted-foreground",
						)}
						strokeWidth={STROKE_WIDTH}
					/>
				)}
				{/* Status indicator */}
				{workspaceStatus && (
					<span className="absolute top-1 right-1">
						<StatusIndicator status={workspaceStatus} />
					</span>
				)}
				{/* Unread dot (only when no status) */}
				{isUnread && !workspaceStatus && (
					<span className="absolute top-1 right-1 flex size-2">
						<span className="relative inline-flex size-2 rounded-full bg-blue-500" />
					</span>
				)}
			</button>
		);

		// Branch workspaces get a simple tooltip
		if (isBranchWorkspace) {
			return (
				<Tooltip delayDuration={300}>
					<TooltipTrigger asChild>{collapsedButton}</TooltipTrigger>
					<TooltipContent side="right" className="flex flex-col gap-0.5">
						<span className="font-medium">{name || branch}</span>
						<span className="text-xs text-muted-foreground">
							Local workspace
						</span>
					</TooltipContent>
				</Tooltip>
			);
		}

		// Worktree workspaces get the full hover card with context menu
		return (
			<>
				<HoverCard
					openDelay={HOVER_CARD_OPEN_DELAY}
					closeDelay={HOVER_CARD_CLOSE_DELAY}
				>
					<ContextMenu>
						<HoverCardTrigger asChild>
							<ContextMenuTrigger asChild>{collapsedButton}</ContextMenuTrigger>
						</HoverCardTrigger>
						<ContextMenuContent>
							<ContextMenuItem onSelect={() => handleDeleteClick()}>
								Close Worktree
							</ContextMenuItem>
						</ContextMenuContent>
					</ContextMenu>
					<HoverCardContent side="right" align="start" className="w-72">
						<WorkspaceHoverCardContent workspaceId={id} workspaceAlias={name} />
					</HoverCardContent>
				</HoverCard>
				<DeleteWorkspaceDialog
					workspaceId={id}
					workspaceName={name}
					workspaceType={type}
					open={showDeleteDialog}
					onOpenChange={setShowDeleteDialog}
				/>
			</>
		);
	}

	const content = (
		<button
			type="button"
			ref={(node) => {
				drag(drop(node));
			}}
			onClick={handleClick}
			onMouseEnter={handleMouseEnter}
			onDoubleClick={isBranchWorkspace ? undefined : rename.startRename}
			className={cn(
				"flex items-center w-full pl-3 pr-2 text-sm",
				"hover:bg-muted/50 transition-colors text-left cursor-pointer",
				"group relative",
				showBranchSubtitle ? "py-1.5" : "py-2",
				isActive && "bg-muted",
				isDragging && "opacity-30",
			)}
			style={{ cursor: isDragging ? "grabbing" : "pointer" }}
		>
			{/* Active indicator - left border */}
			{isActive && (
				<div className="absolute left-0 top-1.5 bottom-1.5 w-0.5 bg-primary rounded-r" />
			)}

			{/* Icon with status indicator */}
			<Tooltip delayDuration={500}>
				<TooltipTrigger asChild>
					<div className="relative shrink-0 size-5 flex items-center justify-center mr-2.5">
						{isBranchWorkspace ? (
							<LuFolder
								className="size-4 text-muted-foreground"
								strokeWidth={STROKE_WIDTH}
							/>
						) : (
							<LuFolderGit2
								className="size-4 text-muted-foreground"
								strokeWidth={STROKE_WIDTH}
							/>
						)}
						{workspaceStatus && (
							<span className="absolute -top-0.5 -right-0.5">
								<StatusIndicator status={workspaceStatus} />
							</span>
						)}
						{isUnread && !workspaceStatus && (
							<span className="absolute -top-0.5 -right-0.5 flex size-2">
								<span className="relative inline-flex size-2 rounded-full bg-blue-500" />
							</span>
						)}
					</div>
				</TooltipTrigger>
				<TooltipContent side="right" sideOffset={8}>
					{isBranchWorkspace ? (
						<>
							<p className="text-xs font-medium">Local workspace</p>
							<p className="text-xs text-muted-foreground">
								Changes are made directly in the main repository
							</p>
						</>
					) : (
						<>
							<p className="text-xs font-medium">Worktree workspace</p>
							<p className="text-xs text-muted-foreground">
								Isolated copy for parallel development
							</p>
						</>
					)}
				</TooltipContent>
			</Tooltip>

			{/* Workspace name and optional branch */}
			<div className="flex-1 min-w-0 mr-2">
				{rename.isRenaming ? (
					<Input
						ref={rename.inputRef}
						variant="ghost"
						value={rename.renameValue}
						onChange={(e) => rename.setRenameValue(e.target.value)}
						onBlur={rename.submitRename}
						onKeyDown={rename.handleKeyDown}
						onClick={(e) => e.stopPropagation()}
						onMouseDown={(e) => e.stopPropagation()}
						className="h-6 px-1 py-0 text-sm -ml-1"
					/>
				) : (
					<div className="flex flex-col justify-center">
						<div className="flex items-center gap-1.5">
							<span
								className={cn(
									"truncate text-[13px] leading-tight",
									isActive
										? "text-foreground font-medium"
										: "text-muted-foreground",
								)}
							>
								{name || branch}
							</span>
							{pr && (
								<WorkspaceStatusBadge state={pr.state} prNumber={pr.number} />
							)}
						</div>
						{showBranchSubtitle && (
							<span className="text-[11px] text-muted-foreground/70 truncate font-mono leading-tight mt-0.5">
								{branch}
							</span>
						)}
					</div>
				)}
			</div>

			{/* Right side actions */}
			<div className="flex items-center gap-1 shrink-0">
				{/* Diff stats - always visible when available */}
				{showDiffStats && (
					<WorkspaceDiffStats
						additions={pr.additions}
						deletions={pr.deletions}
					/>
				)}

				{/* Keyboard shortcut - visible on hover */}
				{shortcutIndex !== undefined &&
					shortcutIndex < MAX_KEYBOARD_SHORTCUT_INDEX && (
						<span className="text-[10px] text-muted-foreground/60 opacity-0 group-hover:opacity-100 transition-opacity font-mono px-1">
							⌘{shortcutIndex + 1}
						</span>
					)}

				{/* Branch switcher for branch workspaces - at the end */}
				{isBranchWorkspace && (
					<BranchSwitcher projectId={projectId} currentBranch={branch} />
				)}

				{/* Close button for worktree workspaces */}
				{!isBranchWorkspace && (
					<Button
						type="button"
						variant="ghost"
						size="icon"
						onClick={handleDeleteClick}
						className={cn(
							"size-6 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity rounded-sm",
							"hover:bg-muted-foreground/10",
							isActive && "opacity-60",
						)}
						aria-label="Close or delete workspace"
					>
						<HiMiniXMark className="size-3.5 text-muted-foreground" />
					</Button>
				)}
			</div>
		</button>
	);

	const unreadMenuItem = (
		<ContextMenuItem onSelect={handleToggleUnread}>
			{isUnread ? (
				<>
					<LuEye className="size-4 mr-2" strokeWidth={STROKE_WIDTH} />
					Mark as Read
				</>
			) : (
				<>
					<LuEyeOff className="size-4 mr-2" strokeWidth={STROKE_WIDTH} />
					Mark as Unread
				</>
			)}
		</ContextMenuItem>
	);

	// Wrap with context menu and hover card
	if (isBranchWorkspace) {
		return (
			<>
				<ContextMenu>
					<ContextMenuTrigger asChild>{content}</ContextMenuTrigger>
					<ContextMenuContent>
						<ContextMenuItem onSelect={handleOpenInFinder}>
							Open in Finder
						</ContextMenuItem>
						<ContextMenuSeparator />
						{unreadMenuItem}
					</ContextMenuContent>
				</ContextMenu>
				<DeleteWorkspaceDialog
					workspaceId={id}
					workspaceName={name}
					workspaceType={type}
					open={showDeleteDialog}
					onOpenChange={setShowDeleteDialog}
				/>
			</>
		);
	}

	return (
		<>
			<HoverCard
				openDelay={HOVER_CARD_OPEN_DELAY}
				closeDelay={HOVER_CARD_CLOSE_DELAY}
			>
				<ContextMenu>
					<HoverCardTrigger asChild>
						<ContextMenuTrigger asChild>{content}</ContextMenuTrigger>
					</HoverCardTrigger>
					<ContextMenuContent>
						<ContextMenuItem onSelect={rename.startRename}>
							Rename
						</ContextMenuItem>
						<ContextMenuSeparator />
						<ContextMenuItem onSelect={handleOpenInFinder}>
							Open in Finder
						</ContextMenuItem>
						<ContextMenuSeparator />
						{unreadMenuItem}
					</ContextMenuContent>
				</ContextMenu>
				<HoverCardContent side="right" align="start" className="w-72">
					<WorkspaceHoverCardContent workspaceId={id} workspaceAlias={name} />
				</HoverCardContent>
			</HoverCard>
			<DeleteWorkspaceDialog
				workspaceId={id}
				workspaceName={name}
				workspaceType={type}
				open={showDeleteDialog}
				onOpenChange={setShowDeleteDialog}
			/>
		</>
	);
}
