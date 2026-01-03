import { Button } from "@superset/ui/button";
import { Input } from "@superset/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import { useDrag, useDrop } from "react-dnd";
import { HiMiniXMark } from "react-icons/hi2";
import { LuGitBranch } from "react-icons/lu";
import {
	useReorderWorkspaces,
	useSetActiveWorkspace,
	useWorkspaceDeleteHandler,
} from "renderer/react-query/workspaces";
import { useCloseSettings } from "renderer/stores/app-state";
import { useTabsStore } from "renderer/stores/tabs/store";
import { extractPaneIdsFromLayout } from "renderer/stores/tabs/utils";
import { BranchSwitcher } from "./BranchSwitcher";
import { DELETE_TOOLTIP_DELAY, WORKSPACE_TOOLTIP_DELAY } from "./constants";
import { DeleteWorkspaceDialog } from "./DeleteWorkspaceDialog";
import { useWorkspaceRename } from "./useWorkspaceRename";
import { WorkspaceItemContextMenu } from "./WorkspaceItemContextMenu";

const WORKSPACE_TYPE = "WORKSPACE";

interface WorkspaceItemProps {
	id: string;
	projectId: string;
	worktreePath: string;
	workspaceType?: "worktree" | "branch";
	branch?: string;
	title: string;
	isActive: boolean;
	isUnread?: boolean;
	index: number;
	width: number;
	onMouseEnter?: () => void;
	onMouseLeave?: () => void;
}

export function WorkspaceItem({
	id,
	projectId,
	worktreePath,
	workspaceType = "worktree",
	branch,
	title,
	isActive,
	isUnread = false,
	index,
	width,
	onMouseEnter,
	onMouseLeave,
}: WorkspaceItemProps) {
	const isBranchWorkspace = workspaceType === "branch";
	const setActive = useSetActiveWorkspace();
	const reorderWorkspaces = useReorderWorkspaces();
	const closeSettings = useCloseSettings();
	const tabs = useTabsStore((s) => s.tabs);
	const panes = useTabsStore((s) => s.panes);
	const clearWorkspaceAttention = useTabsStore(
		(s) => s.clearWorkspaceAttention,
	);
	const rename = useWorkspaceRename(id, title);

	// Shared delete logic
	const { showDeleteDialog, setShowDeleteDialog, handleDeleteClick } =
		useWorkspaceDeleteHandler();

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
			// Only allow reordering within the same project
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

	return (
		<>
			<WorkspaceItemContextMenu
				workspaceId={id}
				worktreePath={worktreePath}
				workspaceAlias={title}
				isUnread={isUnread}
				onRename={rename.startRename}
				canRename={!isBranchWorkspace}
				showHoverCard={!isBranchWorkspace}
			>
				<div
					className="group relative flex items-end shrink-0 h-full no-drag"
					style={{ width: `${width}px` }}
				>
					{/* Main workspace button */}
					<button
						type="button"
						ref={(node) => {
							drag(drop(node));
						}}
						onMouseDown={() => {
							if (!rename.isRenaming) {
								closeSettings();
								setActive.mutate({ id });
								clearWorkspaceAttention(id);
							}
						}}
						onDoubleClick={isBranchWorkspace ? undefined : rename.startRename}
						onMouseEnter={onMouseEnter}
						onMouseLeave={onMouseLeave}
						className={cn(
							"flex items-center gap-1.5 rounded-t-md transition-all w-full shrink-0 pl-3 h-[80%]",
							isBranchWorkspace ? "pr-2" : "pr-6",
							isActive
								? "text-foreground bg-tertiary-active"
								: "text-muted-foreground hover:text-foreground hover:bg-tertiary/30",
							isDragging ? "opacity-30" : "opacity-100",
						)}
						style={{ cursor: isDragging ? "grabbing" : "pointer" }}
					>
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
								className="flex-1 min-w-0 px-1 py-0.5"
							/>
						) : isBranchWorkspace ? (
							<div className="flex items-center gap-2 flex-1 min-w-0">
								<Tooltip delayDuration={WORKSPACE_TOOLTIP_DELAY}>
									<TooltipTrigger asChild>
										<div className="flex items-center gap-2 flex-1 min-w-0">
											<div className="flex items-center justify-center size-5 rounded bg-primary/10 shrink-0">
												<LuGitBranch className="size-3 text-primary" />
											</div>
											<span
												className="text-sm font-medium whitespace-nowrap overflow-hidden flex-1 text-left"
												style={{
													maskImage:
														"linear-gradient(to right, black calc(100% - 16px), transparent 100%)",
													WebkitMaskImage:
														"linear-gradient(to right, black calc(100% - 16px), transparent 100%)",
												}}
											>
												{title}
											</span>
										</div>
									</TooltipTrigger>
									<TooltipContent side="bottom" className="max-w-[200px]">
										<p className="text-xs">
											<span className="font-medium">Main repository</span>
											<br />
											<span className="text-muted-foreground">
												Switch branches without creating worktrees
											</span>
										</p>
									</TooltipContent>
								</Tooltip>
								{branch && (
									<BranchSwitcher
										projectId={projectId}
										currentBranch={branch}
									/>
								)}
							</div>
						) : (
							<>
								<LuGitBranch className="size-3 shrink-0 text-muted-foreground" />
								<span
									className="text-sm whitespace-nowrap overflow-hidden flex-1 text-left"
									style={{
										maskImage:
											"linear-gradient(to right, black calc(100% - 16px), transparent 100%)",
										WebkitMaskImage:
											"linear-gradient(to right, black calc(100% - 16px), transparent 100%)",
									}}
								>
									{title}
								</span>
								{needsAttention && (
									<span className="relative flex size-2 shrink-0">
										<span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
										<span className="relative inline-flex size-2 rounded-full bg-red-500" />
									</span>
								)}
							</>
						)}
					</button>

					{/* Only show close button for worktree workspaces */}
					{!isBranchWorkspace && (
						<Tooltip delayDuration={DELETE_TOOLTIP_DELAY}>
							<TooltipTrigger asChild>
								<Button
									type="button"
									variant="ghost"
									size="icon"
									onClick={(e) => {
										e.stopPropagation();
										handleDeleteClick();
									}}
									className={cn(
										"mt-1 absolute right-1 top-1/2 -translate-y-1/2 cursor-pointer size-5 group-hover:opacity-100",
										isActive ? "opacity-90" : "opacity-0",
									)}
									aria-label="Close or delete workspace"
								>
									<HiMiniXMark />
								</Button>
							</TooltipTrigger>
							<TooltipContent side="bottom" showArrow={false}>
								Close or delete
							</TooltipContent>
						</Tooltip>
					)}
				</div>
			</WorkspaceItemContextMenu>

			<DeleteWorkspaceDialog
				workspaceId={id}
				workspaceName={title}
				workspaceType={workspaceType}
				open={showDeleteDialog}
				onOpenChange={setShowDeleteDialog}
			/>
		</>
	);
}
