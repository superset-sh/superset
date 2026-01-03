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
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import { useState } from "react";
import { useDrag, useDrop } from "react-dnd";
import { HiMiniXMark } from "react-icons/hi2";
import { LuEye, LuEyeOff, LuGitBranch } from "react-icons/lu";
import { trpc } from "renderer/lib/trpc";
import {
	useReorderWorkspaces,
	useSetActiveWorkspace,
	useWorkspaceDeleteHandler,
} from "renderer/react-query/workspaces";
import { BranchSwitcher } from "renderer/screens/main/components/TopBar/WorkspaceTabs/BranchSwitcher";
import { DeleteWorkspaceDialog } from "renderer/screens/main/components/TopBar/WorkspaceTabs/DeleteWorkspaceDialog";
import { useWorkspaceRename } from "renderer/screens/main/components/TopBar/WorkspaceTabs/useWorkspaceRename";
import { WorkspaceHoverCardContent } from "renderer/screens/main/components/TopBar/WorkspaceTabs/WorkspaceHoverCard";
import { useTabsStore } from "renderer/stores/tabs/store";
import { extractPaneIdsFromLayout } from "renderer/stores/tabs/utils";
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
}: WorkspaceListItemProps) {
	const isBranchWorkspace = type === "branch";
	const setActiveWorkspace = useSetActiveWorkspace();
	const reorderWorkspaces = useReorderWorkspaces();
	const [hasHovered, setHasHovered] = useState(false);
	const rename = useWorkspaceRename(id, name);
	const tabs = useTabsStore((s) => s.tabs);
	const panes = useTabsStore((s) => s.panes);
	const clearWorkspaceAttention = useTabsStore(
		(s) => s.clearWorkspaceAttention,
	);
	const utils = trpc.useUtils();
	const openInFinder = trpc.external.openInFinder.useMutation();
	const setUnread = trpc.workspaces.setUnread.useMutation({
		onSuccess: () => {
			utils.workspaces.getAllGrouped.invalidate();
		},
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

	// Check if any pane in tabs belonging to this workspace needs attention (agent notifications)
	const workspaceTabs = tabs.filter((t) => t.workspaceId === id);
	const workspacePaneIds = new Set(
		workspaceTabs.flatMap((t) => extractPaneIdsFromLayout(t.layout)),
	);
	const hasPaneAttention = Object.values(panes)
		.filter((p) => p != null && workspacePaneIds.has(p.id))
		.some((p) => p.needsAttention);

	// Show indicator if workspace is manually marked as unread OR has pane-level attention
	const needsAttention = isUnread || hasPaneAttention;

	const handleClick = () => {
		if (!rename.isRenaming) {
			setActiveWorkspace.mutate({ id });
			clearWorkspaceAttention(id);
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
				reorderWorkspaces.mutate({
					projectId,
					fromIndex: item.index,
					toIndex: index,
				});
				item.index = index;
			}
		},
	});

	const pr = githubStatus?.pr;
	const showDiffStats = pr && (pr.additions > 0 || pr.deletions > 0);

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
				"flex items-center gap-2 w-full px-3 py-1.5 text-sm",
				"hover:bg-muted/50 transition-colors text-left cursor-pointer",
				"group relative",
				isActive && "bg-muted",
				isDragging && "opacity-30",
			)}
			style={{ cursor: isDragging ? "grabbing" : "pointer" }}
		>
			{/* Active indicator - left border */}
			{isActive && (
				<div className="absolute left-0 top-1 bottom-1 w-0.5 bg-primary rounded-r" />
			)}

			{/* Branch icon for branch type workspaces */}
			{isBranchWorkspace && (
				<div className="flex items-center justify-center size-5 rounded bg-primary/10 shrink-0">
					<LuGitBranch className="size-3 text-primary" />
				</div>
			)}

			{/* Workspace name and branch */}
			<div className="flex-1 min-w-0">
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
						className="h-6 px-1 py-0 text-sm"
					/>
				) : (
					<>
						<div className="flex items-center gap-2">
							<span className={cn("truncate", isActive && "font-medium")}>
								{name}
							</span>
							{pr && (
								<WorkspaceStatusBadge state={pr.state} prNumber={pr.number} />
							)}
							{needsAttention && (
								<span className="relative flex size-2 shrink-0">
									<span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
									<span className="relative inline-flex size-2 rounded-full bg-red-500" />
								</span>
							)}
						</div>
						{name !== branch && !isBranchWorkspace && (
							<div className="text-xs text-muted-foreground truncate font-mono">
								{branch}
							</div>
						)}
					</>
				)}
			</div>

			{/* Branch switcher for branch workspaces */}
			{isBranchWorkspace && (
				<BranchSwitcher projectId={projectId} currentBranch={branch} />
			)}

			{/* Diff stats */}
			{showDiffStats && (
				<WorkspaceDiffStats additions={pr.additions} deletions={pr.deletions} />
			)}

			{/* Keyboard shortcut indicator */}
			{shortcutIndex !== undefined &&
				shortcutIndex < MAX_KEYBOARD_SHORTCUT_INDEX && (
					<span className="text-[10px] text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity font-mono shrink-0">
						⌘{shortcutIndex + 1}
					</span>
				)}

			{/* Close button for worktree workspaces */}
			{!isBranchWorkspace && (
				<Tooltip delayDuration={500}>
					<TooltipTrigger asChild>
						<Button
							type="button"
							variant="ghost"
							size="icon"
							onClick={handleDeleteClick}
							className={cn(
								"size-5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity",
								isActive && "opacity-70",
							)}
							aria-label="Close or delete workspace"
						>
							<HiMiniXMark className="size-3.5" />
						</Button>
					</TooltipTrigger>
					<TooltipContent side="right" sideOffset={4}>
						Close or delete
					</TooltipContent>
				</Tooltip>
			)}
		</button>
	);

	const unreadMenuItem = (
		<ContextMenuItem onSelect={handleToggleUnread}>
			{isUnread ? (
				<>
					<LuEye className="size-4 mr-2" />
					Mark as Read
				</>
			) : (
				<>
					<LuEyeOff className="size-4 mr-2" />
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
