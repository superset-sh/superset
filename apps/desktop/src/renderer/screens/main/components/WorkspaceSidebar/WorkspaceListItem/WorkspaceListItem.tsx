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
import { useMatchRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useDrag, useDrop } from "react-dnd";
import { HiMiniXMark } from "react-icons/hi2";
import {
	LuCopy,
	LuEye,
	LuEyeOff,
	LuFolderGit2,
	LuFolderOpen,
	LuLaptop,
	LuPencil,
	LuX,
} from "react-icons/lu";
import { electronTrpc } from "renderer/lib/electron-trpc";
import {
	useReorderWorkspaces,
	useWorkspaceDeleteHandler,
} from "renderer/react-query/workspaces";
import { navigateToWorkspace } from "renderer/routes/_authenticated/_dashboard/utils/workspace-navigation";
import { AsciiSpinner } from "renderer/screens/main/components/AsciiSpinner";
import { StatusIndicator } from "renderer/screens/main/components/StatusIndicator";
import { useBranchSyncInvalidation } from "renderer/screens/main/hooks/useBranchSyncInvalidation";
import { useWorkspaceRename } from "renderer/screens/main/hooks/useWorkspaceRename";
import { useTabsStore } from "renderer/stores/tabs/store";
import { extractPaneIdsFromLayout } from "renderer/stores/tabs/utils";
import { getHighestPriorityStatus } from "shared/tabs-types";
import { STROKE_WIDTH } from "../constants";
import { DeleteWorkspaceDialog, WorkspaceHoverCardContent } from "./components";
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
	isUnread = false,
	index,
	shortcutIndex,
	isCollapsed = false,
}: WorkspaceListItemProps) {
	const isBranchWorkspace = type === "branch";
	const navigate = useNavigate();
	const matchRoute = useMatchRoute();
	const reorderWorkspaces = useReorderWorkspaces();
	const [hasHovered, setHasHovered] = useState(false);
	const rename = useWorkspaceRename(id, name, branch);
	const tabs = useTabsStore((s) => s.tabs);
	const panes = useTabsStore((s) => s.panes);
	const clearWorkspaceAttentionStatus = useTabsStore(
		(s) => s.clearWorkspaceAttentionStatus,
	);
	const utils = electronTrpc.useUtils();

	// Derive isActive from route
	const isActive = !!matchRoute({
		to: "/workspace/$workspaceId",
		params: { workspaceId: id },
		fuzzy: true,
	});

	const itemRef = useRef<HTMLElement | null>(null);
	useEffect(() => {
		if (isActive) {
			itemRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
		}
	}, [isActive]);

	const openInFinder = electronTrpc.external.openInFinder.useMutation({
		onError: (error) => toast.error(`Failed to open: ${error.message}`),
	});
	const setUnread = electronTrpc.workspaces.setUnread.useMutation({
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
	const { data: githubStatus } =
		electronTrpc.workspaces.getGitHubStatus.useQuery(
			{ workspaceId: id },
			{
				enabled: hasHovered && type === "worktree",
				staleTime: GITHUB_STATUS_STALE_TIME,
			},
		);

	// Lazy-load local git changes on hover
	const { data: localChanges } = electronTrpc.changes.getStatus.useQuery(
		{ worktreePath },
		{
			enabled: hasHovered && type === "worktree" && !!worktreePath,
			staleTime: GITHUB_STATUS_STALE_TIME,
		},
	);

	useBranchSyncInvalidation({
		gitBranch: localChanges?.branch,
		workspaceBranch: branch,
		workspaceId: id,
	});

	// Calculate total local changes (staged + unstaged + untracked)
	const localDiffStats = useMemo(() => {
		if (!localChanges) return null;
		const allFiles = [
			...localChanges.staged,
			...localChanges.unstaged,
			...localChanges.untracked,
		];
		const additions = allFiles.reduce((sum, f) => sum + (f.additions || 0), 0);
		const deletions = allFiles.reduce((sum, f) => sum + (f.deletions || 0), 0);
		if (additions === 0 && deletions === 0) return null;
		return { additions, deletions };
	}, [localChanges]);

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
			clearWorkspaceAttentionStatus(id);
			navigateToWorkspace(id, navigate);
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

	const handleCopyPath = async () => {
		if (worktreePath) {
			try {
				await navigator.clipboard.writeText(worktreePath);
				toast.success("Path copied to clipboard");
			} catch {
				toast.error("Failed to copy path");
			}
		}
	};

	// Drag and drop
	const [{ isDragging }, drag] = useDrag(
		() => ({
			type: WORKSPACE_TYPE,
			item: { id, projectId, index, originalIndex: index },
			end: (item, monitor) => {
				if (!item || monitor.didDrop()) return;
				if (item.originalIndex !== item.index) {
					reorderWorkspaces.mutate(
						{
							projectId: item.projectId,
							fromIndex: item.originalIndex,
							toIndex: item.index,
						},
						{
							onError: (error) =>
								toast.error(`Failed to reorder workspace: ${error.message}`),
							onSettled: () => utils.workspaces.getAllGrouped.invalidate(),
						},
					);
				}
			},
			collect: (monitor) => ({
				isDragging: monitor.isDragging(),
			}),
		}),
		[id, projectId, index, reorderWorkspaces],
	);

	const [, drop] = useDrop({
		accept: WORKSPACE_TYPE,
		hover: (item: {
			id: string;
			projectId: string;
			index: number;
			originalIndex: number;
		}) => {
			if (item.projectId === projectId && item.index !== index) {
				utils.workspaces.getAllGrouped.setData(undefined, (oldData) => {
					if (!oldData) return oldData;
					return oldData.map((group) => {
						if (group.project.id !== projectId) return group;
						const workspaces = [...group.workspaces];
						const [moved] = workspaces.splice(item.index, 1);
						workspaces.splice(index, 0, moved);
						return { ...group, workspaces };
					});
				});
				item.index = index;
			}
		},
		drop: (item: {
			id: string;
			projectId: string;
			index: number;
			originalIndex: number;
		}) => {
			if (item.projectId !== projectId) return;
			if (item.originalIndex !== item.index) {
				reorderWorkspaces.mutate(
					{
						projectId,
						fromIndex: item.originalIndex,
						toIndex: item.index,
					},
					{
						onError: (error) =>
							toast.error(`Failed to reorder workspace: ${error.message}`),
						onSettled: () => utils.workspaces.getAllGrouped.invalidate(),
					},
				);
				return { reordered: true };
			}
		},
	});

	const pr = githubStatus?.pr;
	// Show diff stats from PR if available, otherwise from local changes
	const diffStats =
		localDiffStats ||
		(pr && (pr.additions > 0 || pr.deletions > 0)
			? { additions: pr.additions, deletions: pr.deletions }
			: null);
	const showDiffStats = !!diffStats;

	// Determine if we should show the branch subtitle
	const showBranchSubtitle = isBranchWorkspace || (!!name && name !== branch);

	// Collapsed sidebar: show just the icon with hover card (worktree) or tooltip (branch)
	if (isCollapsed) {
		const collapsedButton = (
			<button
				ref={(node) => {
					itemRef.current = node;
				}}
				type="button"
				onClick={handleClick}
				onMouseEnter={handleMouseEnter}
				className={cn(
					"relative flex items-center justify-center size-8 rounded-md",
					"hover:bg-muted/50 transition-colors",
					isActive && "bg-muted",
				)}
			>
				{workspaceStatus === "working" ? (
					<AsciiSpinner className="text-base" />
				) : isBranchWorkspace ? (
					<LuLaptop
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
				{/* Status indicator - only show for non-working statuses */}
				{workspaceStatus && workspaceStatus !== "working" && (
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
						<span className="font-medium">local</span>
						<span className="text-xs text-muted-foreground font-mono">
							{branch}
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
							<ContextMenuItem onSelect={handleCopyPath}>
								<LuCopy className="size-4 mr-2" strokeWidth={STROKE_WIDTH} />
								Copy Path
							</ContextMenuItem>
							<ContextMenuSeparator />
							<ContextMenuItem onSelect={() => handleDeleteClick()}>
								<LuX className="size-4 mr-2" strokeWidth={STROKE_WIDTH} />
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
		// biome-ignore lint/a11y/useSemanticElements: Can't use <button> because this contains nested buttons (BranchSwitcher, close button)
		<div
			role="button"
			tabIndex={0}
			ref={(node) => {
				itemRef.current = node;
				drag(drop(node));
			}}
			onClick={handleClick}
			onKeyDown={(e) => {
				if (e.key === "Enter" || e.key === " ") {
					e.preventDefault();
					handleClick();
				}
			}}
			onMouseEnter={handleMouseEnter}
			onDoubleClick={isBranchWorkspace ? undefined : rename.startRename}
			className={cn(
				"flex w-full pl-3 pr-2 text-sm",
				"hover:bg-muted/50 transition-colors text-left cursor-pointer",
				"group relative",
				showBranchSubtitle ? "py-1.5" : "py-2 items-center",
				isActive && "bg-muted",
				isDragging && "opacity-30",
			)}
			style={{ cursor: isDragging ? "grabbing" : "pointer" }}
		>
			{/* Active indicator - left border */}
			{isActive && (
				<div className="absolute left-0 top-0 bottom-0 w-0.5 bg-primary rounded-r" />
			)}

			{/* Icon with status indicator */}
			<Tooltip delayDuration={500}>
				<TooltipTrigger asChild>
					<div
						className={cn(
							"relative shrink-0 size-5 flex items-center justify-center mr-2.5",
							showBranchSubtitle && "mt-0.5",
						)}
					>
						{workspaceStatus === "working" ? (
							<AsciiSpinner className="text-base" />
						) : isBranchWorkspace ? (
							<LuLaptop
								className={cn(
									"size-4 transition-colors",
									isActive ? "text-foreground" : "text-muted-foreground",
								)}
								strokeWidth={STROKE_WIDTH}
							/>
						) : (
							<LuFolderGit2
								className={cn(
									"size-4 transition-colors",
									isActive ? "text-foreground" : "text-muted-foreground",
								)}
								strokeWidth={STROKE_WIDTH}
							/>
						)}
						{workspaceStatus && workspaceStatus !== "working" && (
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

			{/* Content area */}
			<div className="flex-1 min-w-0">
				{rename.isRenaming ? (
					<Input
						ref={rename.inputRef}
						variant="ghost"
						value={rename.renameValue}
						onChange={(e) => rename.setRenameValue(e.target.value)}
						onBlur={rename.submitRename}
						onKeyDown={(e) => {
							e.stopPropagation();
							rename.handleKeyDown(e);
						}}
						onClick={(e) => e.stopPropagation()}
						onMouseDown={(e) => e.stopPropagation()}
						className="h-6 px-1 py-0 text-sm -ml-1"
					/>
				) : (
					<div className="flex flex-col gap-0.5">
						{/* Row 1: Title + actions */}
						<div className="flex items-center gap-1.5">
							<span
								className={cn(
									"truncate text-[13px] leading-tight transition-colors flex-1",
									isActive
										? "text-foreground font-medium"
										: "text-foreground/80",
								)}
							>
								{isBranchWorkspace ? "local" : name || branch}
							</span>

							{/* Keyboard shortcut */}
							{shortcutIndex !== undefined &&
								shortcutIndex < MAX_KEYBOARD_SHORTCUT_INDEX && (
									<span className="text-[10px] text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity font-mono tabular-nums shrink-0">
										⌘{shortcutIndex + 1}
									</span>
								)}

							{/* Diff stats (transforms to X on hover) or close button for worktree workspaces */}
							{!isBranchWorkspace &&
								(showDiffStats && diffStats ? (
									<WorkspaceDiffStats
										additions={diffStats.additions}
										deletions={diffStats.deletions}
										isActive={isActive}
										onClose={(e) => {
											e.stopPropagation();
											handleDeleteClick();
										}}
									/>
								) : (
									<Tooltip delayDuration={300}>
										<TooltipTrigger asChild>
											<button
												type="button"
												onClick={(e) => {
													e.stopPropagation();
													handleDeleteClick();
												}}
												className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-muted-foreground hover:text-foreground"
												aria-label="Close workspace"
											>
												<HiMiniXMark className="size-3.5" />
											</button>
										</TooltipTrigger>
										<TooltipContent side="top" sideOffset={4}>
											Close workspace
										</TooltipContent>
									</Tooltip>
								))}
						</div>

						{/* Row 2: Git info (branch + PR badge) */}
						{(showBranchSubtitle || pr) && (
							<div className="flex items-center gap-2 text-[11px] w-full">
								{showBranchSubtitle && (
									<span className="text-muted-foreground/60 truncate font-mono leading-tight">
										{branch}
									</span>
								)}
								{pr && (
									<WorkspaceStatusBadge
										state={pr.state}
										prNumber={pr.number}
										prUrl={pr.url}
										className="ml-auto"
									/>
								)}
							</div>
						)}
					</div>
				)}
			</div>
		</div>
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
							<LuFolderOpen
								className="size-4 mr-2"
								strokeWidth={STROKE_WIDTH}
							/>
							Open in Finder
						</ContextMenuItem>
						<ContextMenuItem onSelect={handleCopyPath}>
							<LuCopy className="size-4 mr-2" strokeWidth={STROKE_WIDTH} />
							Copy Path
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
						<ContextMenuItem onSelect={handleCopyPath}>
							<LuCopy className="size-4 mr-2" strokeWidth={STROKE_WIDTH} />
							Copy Path
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
