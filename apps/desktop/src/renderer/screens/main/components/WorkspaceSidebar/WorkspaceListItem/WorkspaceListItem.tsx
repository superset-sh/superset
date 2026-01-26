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
import { useQuery } from "@tanstack/react-query";
import { useMatchRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useDrag, useDrop } from "react-dnd";
import {
	HiMiniXMark,
	HiOutlineCloud,
	HiOutlineExclamationTriangle,
} from "react-icons/hi2";
import {
	LuCopy,
	LuEye,
	LuEyeOff,
	LuFolder,
	LuFolderGit2,
	LuFolderOpen,
	LuPencil,
	LuX,
} from "react-icons/lu";
import { apiTrpcClient } from "renderer/lib/api-trpc-client";
import { electronTrpc } from "renderer/lib/electron-trpc";
import {
	useReorderWorkspaces,
	useWorkspaceDeleteHandler,
} from "renderer/react-query/workspaces";
import { navigateToWorkspace } from "renderer/routes/_authenticated/_dashboard/utils/workspace-navigation";
import { AsciiSpinner } from "renderer/screens/main/components/AsciiSpinner";
import { StatusIndicator } from "renderer/screens/main/components/StatusIndicator";
import { useWorkspaceRename } from "renderer/screens/main/hooks/useWorkspaceRename";
import { useTabsStore } from "renderer/stores/tabs/store";
import { extractPaneIdsFromLayout } from "renderer/stores/tabs/utils";
import { ENABLE_CLOUD_WORKSPACES } from "shared/constants";
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
	isUnread?: boolean;
	index: number;
	shortcutIndex?: number;
	/** Whether the sidebar is in collapsed mode (icon-only view) */
	isCollapsed?: boolean;
	/** Cloud workspace ID if linked to cloud */
	cloudWorkspaceId?: string | null;
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
	cloudWorkspaceId,
}: WorkspaceListItemProps) {
	const isBranchWorkspace = type === "branch";

	const { data: cloudWorkspace } = useQuery({
		queryKey: ["cloudWorkspace", cloudWorkspaceId],
		queryFn: () =>
			apiTrpcClient.cloudWorkspace.byId.query(cloudWorkspaceId as string),
		enabled: ENABLE_CLOUD_WORKSPACES && !!cloudWorkspaceId,
		staleTime: 30_000,
	});

	const isCloudWorkspace = ENABLE_CLOUD_WORKSPACES && !!cloudWorkspaceId;
	const isCloudDeleted = cloudWorkspace?.deletedAt != null;
	const navigate = useNavigate();
	const matchRoute = useMatchRoute();
	const reorderWorkspaces = useReorderWorkspaces();
	const [hasHovered, setHasHovered] = useState(false);
	const rename = useWorkspaceRename(id, name);
	const tabs = useTabsStore((s) => s.tabs);
	const panes = useTabsStore((s) => s.panes);
	const clearWorkspaceAttentionStatus = useTabsStore(
		(s) => s.clearWorkspaceAttentionStatus,
	);
	const utils = electronTrpc.useUtils();

	const isActive = !!matchRoute({
		to: "/workspace/$workspaceId",
		params: { workspaceId: id },
	});
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

	const { showDeleteDialog, setShowDeleteDialog, handleDeleteClick } =
		useWorkspaceDeleteHandler();

	const { data: githubStatus } =
		electronTrpc.workspaces.getGitHubStatus.useQuery(
			{ workspaceId: id },
			{
				enabled: hasHovered && type === "worktree",
				staleTime: GITHUB_STATUS_STALE_TIME,
			},
		);

	const { data: localChanges } = electronTrpc.changes.getStatus.useQuery(
		{ worktreePath },
		{
			enabled: hasHovered && type === "worktree" && !!worktreePath,
			staleTime: GITHUB_STATUS_STALE_TIME,
		},
	);

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

	const workspacePaneIds = useMemo(() => {
		const workspaceTabs = tabs.filter((t) => t.workspaceId === id);
		return new Set(
			workspaceTabs.flatMap((t) => extractPaneIdsFromLayout(t.layout)),
		);
	}, [tabs, id]);

	const workspaceStatus = useMemo(() => {
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
	const diffStats =
		localDiffStats ||
		(pr && (pr.additions > 0 || pr.deletions > 0)
			? { additions: pr.additions, deletions: pr.deletions }
			: null);
	const showDiffStats = !!diffStats;
	const showBranchSubtitle = !isBranchWorkspace;

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
				{workspaceStatus === "working" ? (
					<AsciiSpinner className="text-base" />
				) : isCloudWorkspace && isCloudDeleted ? (
					<HiOutlineExclamationTriangle
						className={cn("size-4 text-destructive")}
					/>
				) : isCloudWorkspace ? (
					<HiOutlineCloud
						className={cn(
							"size-4",
							isActive ? "text-foreground" : "text-muted-foreground",
						)}
					/>
				) : isBranchWorkspace ? (
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
				{workspaceStatus && workspaceStatus !== "working" && (
					<span className="absolute top-1 right-1">
						<StatusIndicator status={workspaceStatus} />
					</span>
				)}
				{isUnread && !workspaceStatus && (
					<span className="absolute top-1 right-1 flex size-2">
						<span className="relative inline-flex size-2 rounded-full bg-blue-500" />
					</span>
				)}
			</button>
		);

		if (isBranchWorkspace || isCloudWorkspace) {
			return (
				<Tooltip delayDuration={300}>
					<TooltipTrigger asChild>{collapsedButton}</TooltipTrigger>
					<TooltipContent side="right" className="flex flex-col gap-0.5">
						<span className="font-medium">{name || branch}</span>
						<span
							className={cn(
								"text-xs",
								isCloudDeleted ? "text-destructive" : "text-muted-foreground",
							)}
						>
							{isCloudDeleted
								? "Cloud workspace deleted"
								: isCloudWorkspace
									? "Cloud workspace"
									: "Local workspace"}
						</span>
					</TooltipContent>
				</Tooltip>
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
				"flex items-center w-full pl-3 pr-2 text-sm",
				"hover:bg-muted/50 transition-colors text-left cursor-pointer",
				"group relative",
				showBranchSubtitle ? "py-1.5" : "py-2",
				isActive && "bg-muted",
				isDragging && "opacity-30",
			)}
			style={{ cursor: isDragging ? "grabbing" : "pointer" }}
		>
			{isActive && (
				<div className="absolute left-0 top-0 bottom-0 w-0.5 bg-primary rounded-r" />
			)}

			<Tooltip delayDuration={500}>
				<TooltipTrigger asChild>
					<div className="relative shrink-0 size-5 flex items-center justify-center mr-2.5">
						{workspaceStatus === "working" ? (
							<AsciiSpinner className="text-base" />
						) : isCloudWorkspace && isCloudDeleted ? (
							<HiOutlineExclamationTriangle
								className={cn("size-4 transition-colors text-destructive")}
							/>
						) : isCloudWorkspace ? (
							<HiOutlineCloud
								className={cn(
									"size-4 transition-colors",
									isActive ? "text-foreground" : "text-muted-foreground",
								)}
							/>
						) : isBranchWorkspace ? (
							<LuFolder
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
					{isCloudWorkspace && isCloudDeleted ? (
						<>
							<p className="text-xs font-medium text-destructive">
								Cloud workspace deleted
							</p>
							<p className="text-xs text-muted-foreground">
								The linked cloud workspace was deleted
							</p>
						</>
					) : isCloudWorkspace ? (
						<>
							<p className="text-xs font-medium">Cloud workspace</p>
							<p className="text-xs text-muted-foreground">
								Linked to cloud for remote access
							</p>
						</>
					) : isBranchWorkspace ? (
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
						<div className="flex items-center gap-1.5">
							<span
								className={cn(
									"truncate text-[13px] leading-tight transition-colors flex-1",
									isActive
										? "text-foreground font-medium"
										: "text-foreground/80",
								)}
							>
								{name || branch}
							</span>

							{shortcutIndex !== undefined &&
								shortcutIndex < MAX_KEYBOARD_SHORTCUT_INDEX && (
									<span className="text-[10px] text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity font-mono tabular-nums shrink-0">
										⌘{shortcutIndex + 1}
									</span>
								)}

							{isBranchWorkspace && (
								<BranchSwitcher projectId={projectId} currentBranch={branch} />
							)}

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
