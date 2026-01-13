import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuTrigger,
} from "@superset/ui/context-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import { useState } from "react";
import {
	LuArrowRight,
	LuFolder,
	LuFolderGit2,
	LuRotateCw,
} from "react-icons/lu";
import { trpc } from "renderer/lib/trpc";
import { useWorkspaceDeleteHandler } from "renderer/react-query/workspaces/useWorkspaceDeleteHandler";
import { STROKE_WIDTH } from "../../WorkspaceSidebar/constants";
import { DeleteWorkspaceDialog } from "../../WorkspaceSidebar/WorkspaceListItem/components/DeleteWorkspaceDialog/DeleteWorkspaceDialog";
import type { WorkspaceItem } from "../types";
import { getRelativeTime } from "../utils";
import { DeleteWorktreeDialog } from "./DeleteWorktreeDialog";

const GITHUB_STATUS_STALE_TIME = 5 * 60 * 1000; // 5 minutes

interface WorkspaceRowProps {
	workspace: WorkspaceItem;
	isActive: boolean;
	onSwitch: () => void;
	onReopen: () => void;
	isOpening?: boolean;
}

export function WorkspaceRow({
	workspace,
	isActive,
	onSwitch,
	onReopen,
	isOpening,
}: WorkspaceRowProps) {
	const isBranch = workspace.type === "branch";
	const [hasHovered, setHasHovered] = useState(false);
	const { showDeleteDialog, setShowDeleteDialog, handleDeleteClick } =
		useWorkspaceDeleteHandler();

	// Lazy-load GitHub status on hover to avoid N+1 queries
	const { data: githubStatus } = trpc.workspaces.getGitHubStatus.useQuery(
		{ workspaceId: workspace.workspaceId ?? "" },
		{
			enabled:
				hasHovered && workspace.type === "worktree" && !!workspace.workspaceId,
			staleTime: GITHUB_STATUS_STALE_TIME,
		},
	);

	const pr = githubStatus?.pr;
	const showDiffStats = pr && (pr.additions > 0 || pr.deletions > 0);

	const timeText = workspace.isOpen
		? `Opened ${getRelativeTime(workspace.lastOpenedAt)}`
		: `Created ${getRelativeTime(workspace.createdAt)}`;

	const handleClick = () => {
		if (workspace.isOpen) {
			onSwitch();
		} else {
			onReopen();
		}
	};

	const button = (
		<button
			type="button"
			onClick={handleClick}
			disabled={isOpening}
			onMouseEnter={() => !hasHovered && setHasHovered(true)}
			className={cn(
				"flex items-center gap-3 w-full px-4 py-2 group text-left",
				"hover:bg-background/50 transition-colors",
				isActive && "bg-background/70",
				isOpening && "opacity-50 cursor-wait",
			)}
		>
			{/* Icon */}
			<Tooltip delayDuration={500}>
				<TooltipTrigger asChild>
					<div
						className={cn(
							"flex items-center justify-center size-6 rounded shrink-0",
							!workspace.isOpen && "opacity-50",
						)}
					>
						{isBranch ? (
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
					</div>
				</TooltipTrigger>
				<TooltipContent side="top" sideOffset={4}>
					{isBranch ? (
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

			{/* Workspace/branch name */}
			<span
				className={cn(
					"text-sm truncate",
					isActive ? "text-foreground font-medium" : "text-foreground/80",
					!workspace.isOpen && "text-foreground/50",
				)}
			>
				{workspace.name}
			</span>

			{/* Active indicator */}
			{isActive && (
				<span className="size-1.5 rounded-full bg-emerald-500 shrink-0" />
			)}

			{/* Unread indicator */}
			{workspace.isUnread && !isActive && (
				<span className="relative flex size-2 shrink-0">
					<span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
					<span className="relative inline-flex size-2 rounded-full bg-red-500" />
				</span>
			)}

			{/* Diff stats */}
			{showDiffStats && (
				<div className="flex items-center gap-1 text-[10px] font-mono shrink-0">
					<span className="text-emerald-500">+{pr.additions}</span>
					<span className="text-destructive-foreground">-{pr.deletions}</span>
				</div>
			)}

			{/* Spacer */}
			<div className="flex-1" />

			{/* Time context */}
			<span className="text-xs text-foreground/40 shrink-0 group-hover:hidden">
				{timeText}
			</span>

			{/* Action indicator - visible on hover */}
			<div className="hidden group-hover:flex items-center gap-1.5 text-xs shrink-0">
				{isOpening ? (
					<>
						<LuRotateCw className="size-3 animate-spin text-foreground/60" />
						<span className="text-foreground/60">Opening...</span>
					</>
				) : workspace.isOpen ? (
					<>
						<span className="font-medium text-foreground/80">Switch to</span>
						<LuArrowRight className="size-3 text-foreground/80" />
					</>
				) : (
					<>
						<span className="font-medium text-foreground/80">Reopen</span>
						<LuArrowRight className="size-3 text-foreground/80" />
					</>
				)}
			</div>
		</button>
	);

	// Determine the delete/close action label based on workspace type and state
	const isOpenWorkspace = workspace.workspaceId !== null;
	const isClosedWorktree = !isOpenWorkspace && workspace.worktreeId !== null;
	const actionLabel = isBranch
		? "Close workspace"
		: isClosedWorktree
			? "Delete worktree"
			: "Delete workspace";

	// Can delete open workspaces or closed worktrees
	const canDelete = isOpenWorkspace || isClosedWorktree;

	return (
		<>
			<ContextMenu>
				<ContextMenuTrigger asChild>{button}</ContextMenuTrigger>
				<ContextMenuContent>
					<ContextMenuItem
						onSelect={() => handleDeleteClick()}
						className="text-destructive focus:text-destructive"
						disabled={!canDelete}
					>
						{actionLabel}
					</ContextMenuItem>
				</ContextMenuContent>
			</ContextMenu>

			{/* Dialog for open workspaces */}
			{workspace.workspaceId && (
				<DeleteWorkspaceDialog
					workspaceId={workspace.workspaceId}
					workspaceName={workspace.name}
					workspaceType={workspace.type}
					open={showDeleteDialog}
					onOpenChange={setShowDeleteDialog}
				/>
			)}

			{/* Dialog for closed worktrees */}
			{isClosedWorktree && workspace.worktreeId && (
				<DeleteWorktreeDialog
					worktreeId={workspace.worktreeId}
					worktreeName={workspace.name}
					open={showDeleteDialog}
					onOpenChange={setShowDeleteDialog}
				/>
			)}
		</>
	);
}
