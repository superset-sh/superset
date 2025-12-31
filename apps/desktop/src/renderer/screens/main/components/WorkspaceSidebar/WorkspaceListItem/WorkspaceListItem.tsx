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
import { useState } from "react";
import { useDrag, useDrop } from "react-dnd";
import { HiMiniXMark } from "react-icons/hi2";
import { LuGitBranch } from "react-icons/lu";
import { trpc } from "renderer/lib/trpc";
import {
	useDeleteWorkspace,
	useReorderWorkspaces,
	useSetActiveWorkspace,
} from "renderer/react-query/workspaces";
import { BranchSwitcher } from "renderer/screens/main/components/TopBar/WorkspaceTabs/BranchSwitcher";
import { DeleteWorkspaceDialog } from "renderer/screens/main/components/TopBar/WorkspaceTabs/DeleteWorkspaceDialog";
import { useWorkspaceRename } from "renderer/screens/main/components/TopBar/WorkspaceTabs/useWorkspaceRename";
import { WorkspaceHoverCardContent } from "renderer/screens/main/components/TopBar/WorkspaceTabs/WorkspaceHoverCard";
import { useTabsStore } from "renderer/stores/tabs/store";
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
	index,
	shortcutIndex,
}: WorkspaceListItemProps) {
	const isBranchWorkspace = type === "branch";
	const setActiveWorkspace = useSetActiveWorkspace();
	const reorderWorkspaces = useReorderWorkspaces();
	const deleteWorkspace = useDeleteWorkspace();
	const [hasHovered, setHasHovered] = useState(false);
	const [showDeleteDialog, setShowDeleteDialog] = useState(false);
	const rename = useWorkspaceRename(id, name);
	const tabs = useTabsStore((s) => s.tabs);
	const panes = useTabsStore((s) => s.panes);
	const openInFinder = trpc.external.openInFinder.useMutation();

	// Query to check if workspace can be deleted
	const canDeleteQuery = trpc.workspaces.canDelete.useQuery(
		{ id },
		{ enabled: false },
	);

	// Lazy-load GitHub status on hover to avoid N+1 queries
	const { data: githubStatus } = trpc.workspaces.getGitHubStatus.useQuery(
		{ workspaceId: id },
		{
			enabled: hasHovered && type === "worktree",
			staleTime: 30_000,
		},
	);

	// Check if any pane in tabs belonging to this workspace needs attention
	const workspaceTabs = tabs.filter((t) => t.workspaceId === id);
	const workspacePaneIds = new Set(
		workspaceTabs.flatMap((t) => {
			const collectPaneIds = (node: unknown): string[] => {
				if (typeof node === "string") return [node];
				if (
					node &&
					typeof node === "object" &&
					"first" in node &&
					"second" in node
				) {
					const b = node as { first: unknown; second: unknown };
					return [...collectPaneIds(b.first), ...collectPaneIds(b.second)];
				}
				return [];
			};
			return collectPaneIds(t.layout);
		}),
	);
	const needsAttention = Object.values(panes)
		.filter((p) => workspacePaneIds.has(p.id))
		.some((p) => p.needsAttention);

	const handleClick = () => {
		if (!rename.isRenaming) {
			setActiveWorkspace.mutate({ id });
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

	const handleDeleteClick = async (e: React.MouseEvent) => {
		e.stopPropagation();
		if (deleteWorkspace.isPending || canDeleteQuery.isFetching) return;

		try {
			const { data: canDeleteData } = await canDeleteQuery.refetch();

			if (isBranchWorkspace) {
				if (
					canDeleteData?.activeTerminalCount &&
					canDeleteData.activeTerminalCount > 0
				) {
					setShowDeleteDialog(true);
				} else {
					toast.promise(deleteWorkspace.mutateAsync({ id }), {
						loading: `Closing "${name}"...`,
						success: `Workspace "${name}" closed`,
						error: (error) =>
							error instanceof Error
								? `Failed to close workspace: ${error.message}`
								: "Failed to close workspace",
					});
				}
				return;
			}

			const isEmpty =
				canDeleteData?.canDelete &&
				canDeleteData.activeTerminalCount === 0 &&
				!canDeleteData.warning &&
				!canDeleteData.hasChanges &&
				!canDeleteData.hasUnpushedCommits;

			if (isEmpty) {
				toast.promise(deleteWorkspace.mutateAsync({ id }), {
					loading: `Deleting "${name}"...`,
					success: `Workspace "${name}" deleted`,
					error: (error) =>
						error instanceof Error
							? `Failed to delete workspace: ${error.message}`
							: "Failed to delete workspace",
				});
			} else {
				setShowDeleteDialog(true);
			}
		} catch {
			setShowDeleteDialog(true);
		}
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
			{shortcutIndex !== undefined && shortcutIndex < 9 && (
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
							aria-label="Delete workspace"
						>
							<HiMiniXMark className="size-3.5" />
						</Button>
					</TooltipTrigger>
					<TooltipContent side="right" sideOffset={4}>
						Delete workspace
					</TooltipContent>
				</Tooltip>
			)}
		</button>
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
			<HoverCard openDelay={400} closeDelay={100}>
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
