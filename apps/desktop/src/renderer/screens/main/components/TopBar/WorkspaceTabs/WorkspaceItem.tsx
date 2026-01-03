import { Button } from "@superset/ui/button";
import { Input } from "@superset/ui/input";
import { toast } from "@superset/ui/sonner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import { useState } from "react";
import { useDrag, useDrop } from "react-dnd";
import { HiMiniXMark } from "react-icons/hi2";
import { LuGitBranch, LuLoader } from "react-icons/lu";
import { trpc } from "renderer/lib/trpc";
import {
	useDeleteWorkspace,
	useReorderWorkspaces,
	useSetActiveWorkspace,
} from "renderer/react-query/workspaces";
import { useCloseSettings } from "renderer/stores/app-state";
import { useTabsStore } from "renderer/stores/tabs/store";
import {
	useHasWorkspaceFailed,
	useIsWorkspaceInitializing,
	useWorkspaceInitProgress,
} from "renderer/stores/workspace-init";
import { BranchSwitcher } from "./BranchSwitcher";
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
	index,
	width,
	onMouseEnter,
	onMouseLeave,
}: WorkspaceItemProps) {
	const isBranchWorkspace = workspaceType === "branch";
	const setActive = useSetActiveWorkspace();
	const reorderWorkspaces = useReorderWorkspaces();
	const deleteWorkspace = useDeleteWorkspace();
	const closeSettings = useCloseSettings();
	const [showDeleteDialog, setShowDeleteDialog] = useState(false);
	const tabs = useTabsStore((s) => s.tabs);
	const panes = useTabsStore((s) => s.panes);
	const rename = useWorkspaceRename(id, title);

	// Workspace initialization state
	const isInitializing = useIsWorkspaceInitializing(id);
	const hasFailed = useHasWorkspaceFailed(id);
	const initProgress = useWorkspaceInitProgress(id);

	// Query to check if workspace is empty - only enabled when needed
	const canDeleteQuery = trpc.workspaces.canDelete.useQuery(
		{ id },
		{ enabled: false },
	);

	const handleDeleteClick = async () => {
		// Prevent double-clicks and race conditions
		if (deleteWorkspace.isPending || canDeleteQuery.isFetching) return;

		try {
			// Always fetch fresh data before deciding
			const { data: canDeleteData } = await canDeleteQuery.refetch();

			// For branch workspaces, only show dialog if there are active terminals
			// (no destructive action - branch stays in repo)
			if (isBranchWorkspace) {
				if (
					canDeleteData?.activeTerminalCount &&
					canDeleteData.activeTerminalCount > 0
				) {
					setShowDeleteDialog(true);
				} else {
					// Close directly without confirmation
					toast.promise(deleteWorkspace.mutateAsync({ id }), {
						loading: `Closing "${title}"...`,
						success: `Workspace "${title}" closed`,
						error: (error) =>
							error instanceof Error
								? `Failed to close workspace: ${error.message}`
								: "Failed to close workspace",
					});
				}
				return;
			}

			// For worktree workspaces, check all conditions
			const isEmpty =
				canDeleteData?.canDelete &&
				canDeleteData.activeTerminalCount === 0 &&
				!canDeleteData.warning &&
				!canDeleteData.hasChanges &&
				!canDeleteData.hasUnpushedCommits;

			if (isEmpty) {
				// Delete directly without confirmation
				toast.promise(deleteWorkspace.mutateAsync({ id }), {
					loading: `Deleting "${title}"...`,
					success: `Workspace "${title}" deleted`,
					error: (error) =>
						error instanceof Error
							? `Failed to delete workspace: ${error.message}`
							: "Failed to delete workspace",
				});
			} else {
				// Show confirmation dialog
				setShowDeleteDialog(true);
			}
		} catch {
			// On error checking status, show dialog for user to decide
			setShowDeleteDialog(true);
		}
	};

	// Check if any pane in tabs belonging to this workspace needs attention
	const workspaceTabs = tabs.filter((t) => t.workspaceId === id);
	const workspacePaneIds = new Set(
		workspaceTabs.flatMap((t) => {
			// Extract pane IDs from the layout (which is a MosaicNode<string>)
			const collectPaneIds = (node: unknown): string[] => {
				if (typeof node === "string") return [node];
				if (
					node &&
					typeof node === "object" &&
					"first" in node &&
					"second" in node
				) {
					const branch = node as { first: unknown; second: unknown };
					return [
						...collectPaneIds(branch.first),
						...collectPaneIds(branch.second),
					];
				}
				return [];
			};
			return collectPaneIds(t.layout);
		}),
	);
	const needsAttention = Object.values(panes)
		.filter((p) => workspacePaneIds.has(p.id))
		.some((p) => p.needsAttention);

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
								<Tooltip delayDuration={600}>
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
								{isInitializing ? (
									<LuLoader className="size-3 shrink-0 text-muted-foreground animate-spin" />
								) : (
									<LuGitBranch className="size-3 shrink-0 text-muted-foreground" />
								)}
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
								{/* Show status indicators */}
								{hasFailed ? (
									<Tooltip delayDuration={300}>
										<TooltipTrigger asChild>
											<span className="relative flex size-2 shrink-0">
												<span className="relative inline-flex size-2 rounded-full bg-red-500" />
											</span>
										</TooltipTrigger>
										<TooltipContent side="bottom">
											<p className="text-xs">
												Initialization failed
												{initProgress?.error && (
													<>
														<br />
														<span className="text-muted-foreground">
															{initProgress.error}
														</span>
													</>
												)}
											</p>
										</TooltipContent>
									</Tooltip>
								) : isInitializing ? (
									<Tooltip delayDuration={300}>
										<TooltipTrigger asChild>
											<span className="relative flex size-2 shrink-0">
												<span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-75" />
												<span className="relative inline-flex size-2 rounded-full bg-blue-500" />
											</span>
										</TooltipTrigger>
										<TooltipContent side="bottom">
											<p className="text-xs">
												{initProgress?.message ?? "Initializing..."}
											</p>
										</TooltipContent>
									</Tooltip>
								) : needsAttention ? (
									<span className="relative flex size-2 shrink-0">
										<span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
										<span className="relative inline-flex size-2 rounded-full bg-red-500" />
									</span>
								) : null}
							</>
						)}
					</button>

					{/* Only show close button for worktree workspaces, disabled while initializing */}
					{!isBranchWorkspace && (
						<Tooltip delayDuration={500}>
							<TooltipTrigger asChild>
								<Button
									type="button"
									variant="ghost"
									size="icon"
									disabled={isInitializing}
									onClick={(e) => {
										e.stopPropagation();
										if (!isInitializing) {
											handleDeleteClick();
										}
									}}
									className={cn(
										"mt-1 absolute right-1 top-1/2 -translate-y-1/2 cursor-pointer size-5 group-hover:opacity-100",
										isActive ? "opacity-90" : "opacity-0",
										isInitializing && "opacity-30 cursor-not-allowed",
									)}
									aria-label="Delete workspace"
								>
									<HiMiniXMark />
								</Button>
							</TooltipTrigger>
							<TooltipContent side="bottom" showArrow={false}>
								{isInitializing
									? "Cannot delete while initializing"
									: "Delete workspace"}
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
