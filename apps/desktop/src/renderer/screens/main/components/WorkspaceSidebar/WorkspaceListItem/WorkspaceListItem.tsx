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
	LuBellOff,
	LuCopy,
	LuEye,
	LuEyeOff,
	LuFolderOpen,
	LuPencil,
} from "react-icons/lu";
import { electronTrpc } from "renderer/lib/electron-trpc";
import {
	useReorderWorkspaces,
	useWorkspaceDeleteHandler,
} from "renderer/react-query/workspaces";
import { navigateToWorkspace } from "renderer/routes/_authenticated/_dashboard/utils/workspace-navigation";
import { useBranchSyncInvalidation } from "renderer/screens/main/hooks/useBranchSyncInvalidation";
import { useGitChangesStatus } from "renderer/screens/main/hooks/useGitChangesStatus";
import { useWorkspaceRename } from "renderer/screens/main/hooks/useWorkspaceRename";
import { useTabsStore } from "renderer/stores/tabs/store";
import { extractPaneIdsFromLayout } from "renderer/stores/tabs/utils";
import { getHighestPriorityStatus } from "shared/tabs-types";
import { STROKE_WIDTH } from "../constants";
import { CollapsedWorkspaceItem } from "./CollapsedWorkspaceItem";
import { DeleteWorkspaceDialog, WorkspaceHoverCardContent } from "./components";
import {
	GITHUB_STATUS_STALE_TIME,
	HOVER_CARD_CLOSE_DELAY,
	HOVER_CARD_OPEN_DELAY,
	MAX_KEYBOARD_SHORTCUT_INDEX,
} from "./constants";
import { WorkspaceAheadBehind } from "./WorkspaceAheadBehind";
import { WorkspaceDiffStats } from "./WorkspaceDiffStats";
import { WorkspaceIcon } from "./WorkspaceIcon";
import { WorkspaceStatusBadge } from "./WorkspaceStatusBadge";

const WORKSPACE_DND_TYPE = "WORKSPACE";

interface DragItem {
	id: string;
	projectId: string;
	index: number;
	originalIndex: number;
}

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
	const [isContextMenuOpen, setIsContextMenuOpen] = useState(false);
	const rename = useWorkspaceRename(id, name, branch);
	const tabs = useTabsStore((s) => s.tabs);
	const panes = useTabsStore((s) => s.panes);
	const clearWorkspaceAttentionStatus = useTabsStore(
		(s) => s.clearWorkspaceAttentionStatus,
	);
	const resetWorkspaceStatus = useTabsStore((s) => s.resetWorkspaceStatus);
	const utils = electronTrpc.useUtils();

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
		onSuccess: () => utils.workspaces.getAllGrouped.invalidate(),
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

	const { status: localChanges } = useGitChangesStatus({
		worktreePath,
		enabled: hasHovered && !!worktreePath,
		staleTime: GITHUB_STATUS_STALE_TIME,
	});

	const { data: aheadBehind, refetch: refetchAheadBehind } =
		electronTrpc.workspaces.getAheadBehind.useQuery(
			{ workspaceId: id },
			{
				enabled: isBranchWorkspace,
				staleTime: GITHUB_STATUS_STALE_TIME,
				refetchInterval: hasHovered ? GITHUB_STATUS_STALE_TIME : false,
			},
		);

	useBranchSyncInvalidation({
		gitBranch: localChanges?.branch,
		workspaceBranch: branch,
		workspaceId: id,
	});

	const localDiffStats = useMemo(() => {
		if (!localChanges) return null;
		const allFiles =
			localChanges.againstBase.length > 0
				? localChanges.againstBase
				: [
						...localChanges.staged,
						...localChanges.unstaged,
						...localChanges.untracked,
					];
		const additions = allFiles.reduce((sum, f) => sum + (f.additions || 0), 0);
		const deletions = allFiles.reduce((sum, f) => sum + (f.deletions || 0), 0);
		if (additions === 0 && deletions === 0) return null;
		return { additions, deletions };
	}, [localChanges]);

	const workspaceStatus = useMemo(() => {
		const workspaceTabs = tabs.filter((t) => t.workspaceId === id);
		const paneIds = new Set(
			workspaceTabs.flatMap((t) => extractPaneIdsFromLayout(t.layout)),
		);
		function* paneStatuses() {
			for (const paneId of paneIds) {
				yield panes[paneId]?.status;
			}
		}
		return getHighestPriorityStatus(paneStatuses());
	}, [tabs, panes, id]);

	const handleClick = () => {
		if (!rename.isRenaming) {
			clearWorkspaceAttentionStatus(id);
			navigateToWorkspace(id, navigate);
		}
	};

	const handleMouseEnter = () => {
		if (!hasHovered) setHasHovered(true);
		if (isBranchWorkspace) void refetchAheadBehind();
	};

	const handleOpenInFinder = () => {
		if (worktreePath) openInFinder.mutate(worktreePath);
	};

	const handleCopyPath = async () => {
		if (!worktreePath) return;
		try {
			await navigator.clipboard.writeText(worktreePath);
			toast.success("Path copied to clipboard");
		} catch {
			toast.error("Failed to copy path");
		}
	};

	const handleReorder = (item: DragItem) => {
		if (item.originalIndex === item.index) return;
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
	};

	const [{ isDragging }, drag] = useDrag(
		() => ({
			type: WORKSPACE_DND_TYPE,
			item: { id, projectId, index, originalIndex: index },
			end: (item, monitor) => {
				if (item && !monitor.didDrop()) handleReorder(item);
			},
			collect: (monitor) => ({ isDragging: monitor.isDragging() }),
		}),
		[id, projectId, index, reorderWorkspaces],
	);

	const [, drop] = useDrop({
		accept: WORKSPACE_DND_TYPE,
		hover: (item: DragItem) => {
			if (item.projectId !== projectId || item.index === index) return;
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
		},
		drop: (item: DragItem) => {
			if (item.projectId === projectId) {
				handleReorder(item);
				if (item.originalIndex !== item.index) return { reordered: true };
			}
		},
	});

	const pr = githubStatus?.pr;
	const diffStats =
		localDiffStats ||
		(pr && (pr.additions > 0 || pr.deletions > 0)
			? { additions: pr.additions, deletions: pr.deletions }
			: null);

	const showBranchSubtitle = isBranchWorkspace || (!!name && name !== branch);

	if (isCollapsed) {
		return (
			<CollapsedWorkspaceItem
				id={id}
				name={name}
				branch={branch}
				type={type}
				isActive={isActive}
				isUnread={isUnread}
				workspaceStatus={workspaceStatus}
				itemRef={itemRef}
				showDeleteDialog={showDeleteDialog}
				setShowDeleteDialog={setShowDeleteDialog}
				onMouseEnter={handleMouseEnter}
				onClick={handleClick}
				onDeleteClick={handleDeleteClick}
				onCopyPath={handleCopyPath}
			/>
		);
	}

	const content = (
		// biome-ignore lint/a11y/useSemanticElements: Contains nested interactive elements
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
			onAuxClick={(e) => {
				if (e.button === 1) {
					e.preventDefault();
					handleDeleteClick();
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
			{isActive && (
				<div className="absolute left-0 top-0 bottom-0 w-0.5 bg-primary rounded-r" />
			)}

			<Tooltip delayDuration={500}>
				<TooltipTrigger asChild>
					<div
						className={cn(
							"relative shrink-0 size-5 flex items-center justify-center mr-2.5",
							showBranchSubtitle && "mt-0.5",
						)}
					>
						<WorkspaceIcon
							isBranchWorkspace={isBranchWorkspace}
							isActive={isActive}
							isUnread={isUnread}
							workspaceStatus={workspaceStatus}
							variant="expanded"
						/>
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
								{isBranchWorkspace ? "local" : name || branch}
							</span>

							{isBranchWorkspace && aheadBehind && (
								<WorkspaceAheadBehind
									ahead={aheadBehind.ahead}
									behind={aheadBehind.behind}
								/>
							)}

							<div className="grid shrink-0 h-5 [&>*]:col-start-1 [&>*]:row-start-1 items-center">
								{diffStats && (
									<WorkspaceDiffStats
										additions={diffStats.additions}
										deletions={diffStats.deletions}
										isActive={isActive}
									/>
								)}
								<div className="flex items-center justify-end gap-1.5 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-[opacity,visibility]">
									{shortcutIndex !== undefined &&
										shortcutIndex < MAX_KEYBOARD_SHORTCUT_INDEX && (
											<span className="text-[10px] text-muted-foreground font-mono tabular-nums shrink-0">
												⌘{shortcutIndex + 1}
											</span>
										)}
									{!isBranchWorkspace && (
										<Tooltip delayDuration={300}>
											<TooltipTrigger asChild>
												<button
													type="button"
													onClick={(e) => {
														e.stopPropagation();
														handleDeleteClick();
													}}
													className="flex items-center justify-center text-muted-foreground hover:text-foreground"
													aria-label="Close workspace"
												>
													<HiMiniXMark className="size-3.5" />
												</button>
											</TooltipTrigger>
											<TooltipContent side="top" sideOffset={4}>
												Close workspace
											</TooltipContent>
										</Tooltip>
									)}
								</div>
							</div>
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
		<ContextMenuItem
			onSelect={() => setUnread.mutate({ id, isUnread: !isUnread })}
		>
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

	const commonContextMenuItems = (
		<>
			<ContextMenuItem onSelect={handleOpenInFinder}>
				<LuFolderOpen className="size-4 mr-2" strokeWidth={STROKE_WIDTH} />
				Open in Finder
			</ContextMenuItem>
			<ContextMenuItem onSelect={handleCopyPath}>
				<LuCopy className="size-4 mr-2" strokeWidth={STROKE_WIDTH} />
				Copy Path
			</ContextMenuItem>
			<ContextMenuSeparator />
			{unreadMenuItem}
			{workspaceStatus && (
				<ContextMenuItem onSelect={() => resetWorkspaceStatus(id)}>
					<LuBellOff className="size-4 mr-2" strokeWidth={STROKE_WIDTH} />
					Clear Status
				</ContextMenuItem>
			)}
		</>
	);

	if (isBranchWorkspace) {
		return (
			<>
				<ContextMenu>
					<ContextMenuTrigger asChild>{content}</ContextMenuTrigger>
					<ContextMenuContent>{commonContextMenuItems}</ContextMenuContent>
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
				open={isContextMenuOpen ? false : undefined}
				openDelay={HOVER_CARD_OPEN_DELAY}
				closeDelay={HOVER_CARD_CLOSE_DELAY}
			>
				<ContextMenu onOpenChange={setIsContextMenuOpen}>
					<HoverCardTrigger asChild>
						<ContextMenuTrigger asChild>{content}</ContextMenuTrigger>
					</HoverCardTrigger>
					<ContextMenuContent>
						<ContextMenuItem onSelect={rename.startRename}>
							<LuPencil className="size-4 mr-2" strokeWidth={STROKE_WIDTH} />
							Rename
						</ContextMenuItem>
						<ContextMenuSeparator />
						{commonContextMenuItems}
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
