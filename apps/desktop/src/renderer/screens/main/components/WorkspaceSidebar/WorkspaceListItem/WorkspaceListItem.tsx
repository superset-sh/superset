import { Input } from "@superset/ui/input";
import { toast } from "@superset/ui/sonner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import { useMatchRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { HiMiniXMark } from "react-icons/hi2";
import { useCopyToClipboard } from "renderer/hooks/useCopyToClipboard";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useWorkspaceDeleteHandler } from "renderer/react-query/workspaces";
import { navigateToWorkspace } from "renderer/routes/_authenticated/_dashboard/utils/workspace-navigation";
import { WorkspaceRunIndicator } from "renderer/screens/main/components/WorkspaceRunIndicator";
import { useBranchSyncInvalidation } from "renderer/screens/main/hooks/useBranchSyncInvalidation";
import { useGitChangesStatus } from "renderer/screens/main/hooks/useGitChangesStatus";
import { useWorkspaceRename } from "renderer/screens/main/hooks/useWorkspaceRename";
import { useActiveDragItemStore } from "renderer/stores/active-drag-item";
import { useTabsStore } from "renderer/stores/tabs/store";
import { extractPaneIdsFromLayout } from "renderer/stores/tabs/utils";
import { useWorkspaceSelectionStore } from "renderer/stores/workspace-selection";
import { getHighestPriorityStatus } from "shared/tabs-types";
import { CollapsedWorkspaceItem } from "./CollapsedWorkspaceItem";
import { DeleteWorkspaceDialog } from "./components";
import {
	GITHUB_STATUS_STALE_TIME,
	MAX_KEYBOARD_SHORTCUT_INDEX,
} from "./constants";
import { useWorkspaceDnD } from "./useWorkspaceDnD";
import { WorkspaceAheadBehind } from "./WorkspaceAheadBehind";
import { WorkspaceContextMenu } from "./WorkspaceContextMenu";
import { WorkspaceDiffStats } from "./WorkspaceDiffStats";
import { WorkspaceIcon } from "./WorkspaceIcon";
import { WorkspaceStatusBadge } from "./WorkspaceStatusBadge";

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
	sectionId?: string | null;
	sections?: { id: string; name: string }[];
	orderedWorkspaceIds?: string[];
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
	sectionId = null,
	sections = [],
	orderedWorkspaceIds = [],
}: WorkspaceListItemProps) {
	const isBranchWorkspace = type === "branch";
	const navigate = useNavigate();
	const matchRoute = useMatchRoute();
	const [hasHovered, setHasHovered] = useState(false);
	const rename = useWorkspaceRename(id, name, branch);
	const workspaceStatus = useTabsStore((state) => {
		function* paneStatuses() {
			for (const tab of state.tabs) {
				if (tab.workspaceId !== id) continue;
				for (const paneId of extractPaneIdsFromLayout(tab.layout)) {
					yield state.panes[paneId]?.status;
				}
			}
		}
		return getHighestPriorityStatus(paneStatuses());
	});
	const workspaceRunState = useTabsStore((state) => {
		for (const pane of Object.values(state.panes)) {
			if (pane.type === "terminal" && pane.workspaceRun?.workspaceId === id) {
				return pane.workspaceRun.state;
			}
		}
		return null;
	});
	const clearWorkspaceAttentionStatus = useTabsStore(
		(s) => s.clearWorkspaceAttentionStatus,
	);
	const resetWorkspaceStatus = useTabsStore((s) => s.resetWorkspaceStatus);
	const utils = electronTrpc.useUtils();
	const isSelected = useWorkspaceSelectionStore((s) => s.selectedIds.has(id));
	const selectionStore = useWorkspaceSelectionStore;
	const isMultiDragging = useActiveDragItemStore(
		(s) =>
			s.activeDragItem?.selectedIds?.includes(id) && s.activeDragItem.id !== id,
	);

	const isActive = !!matchRoute({
		to: "/workspace/$workspaceId",
		params: { workspaceId: id },
		fuzzy: true,
	});

	const { isDragging, drag, drop } = useWorkspaceDnD({
		id,
		projectId,
		sectionId,
		index,
	});

	const expandedItemRef = useRef<HTMLDivElement>(null);
	const collapsedItemRef = useRef<HTMLButtonElement>(null);

	useEffect(() => {
		if (isCollapsed) {
			drag(drop(collapsedItemRef));
			return;
		}
		drag(drop(expandedItemRef));
	}, [drag, drop, isCollapsed]);

	useEffect(() => {
		if (!isActive) return;
		const activeNode = isCollapsed
			? collapsedItemRef.current
			: expandedItemRef.current;
		activeNode?.scrollIntoView({ block: "nearest", behavior: "smooth" });
	}, [isActive, isCollapsed]);

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
				enabled: type === "worktree",
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

	const handleClick = (e?: React.MouseEvent) => {
		if (rename.isRenaming) return;

		if (e?.metaKey) {
			selectionStore.getState().toggle(id, projectId);
			return;
		}

		if (e?.shiftKey) {
			const { lastClickedId } = selectionStore.getState();
			if (lastClickedId) {
				const lastIdx = orderedWorkspaceIds.indexOf(lastClickedId);
				const currIdx = orderedWorkspaceIds.indexOf(id);
				if (lastIdx !== -1 && currIdx !== -1) {
					const [start, end] = [
						Math.min(lastIdx, currIdx),
						Math.max(lastIdx, currIdx),
					];
					const rangeIds = orderedWorkspaceIds.slice(start, end + 1);
					selectionStore.getState().selectRange(rangeIds, projectId);
					return;
				}
			}
		}

		selectionStore.getState().clearSelection();
		selectionStore.setState({ lastClickedId: id });
		clearWorkspaceAttentionStatus(id);
		navigateToWorkspace(id, navigate);
	};

	const handleMouseEnter = () => {
		if (!hasHovered) setHasHovered(true);
		if (isBranchWorkspace) void refetchAheadBehind();
	};

	const handleOpenInFinder = () => {
		if (worktreePath) openInFinder.mutate(worktreePath);
	};

	const { copyToClipboard } = useCopyToClipboard();
	const handleCopyPath = async () => {
		if (!worktreePath) return;
		await copyToClipboard(worktreePath);
		toast.success("Path copied to clipboard");
	};

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
				itemRef={collapsedItemRef}
				showDeleteDialog={showDeleteDialog}
				setShowDeleteDialog={setShowDeleteDialog}
				onMouseEnter={handleMouseEnter}
				onClick={handleClick}
				onDeleteClick={handleDeleteClick}
				onCopyPath={handleCopyPath}
				prState={githubStatus?.pr?.state}
			/>
		);
	}

	const content = (
		// biome-ignore lint/a11y/useSemanticElements: Contains nested interactive elements
		<div
			role="button"
			tabIndex={0}
			ref={expandedItemRef}
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
				isSelected && "bg-primary/10 ring-1 ring-inset ring-primary/30",
				(isDragging || isMultiDragging) && "opacity-30",
			)}
			style={{ cursor: isDragging ? "grabbing" : "pointer" }}
		>
			{isActive && (
				<div className="absolute left-0 top-0 bottom-0 w-0.5 bg-primary rounded-r" />
			)}

			<div
				className={cn(
					"flex flex-col items-center shrink-0 mr-2.5 gap-0.5",
					showBranchSubtitle && "mt-0.5",
				)}
			>
				<Tooltip delayDuration={500}>
					<TooltipTrigger asChild>
						<div className="relative size-5 flex items-center justify-center">
							<WorkspaceIcon
								isBranchWorkspace={isBranchWorkspace}
								isActive={isActive}
								isUnread={isUnread}
								workspaceStatus={workspaceStatus}
								variant="expanded"
								prState={githubStatus?.pr?.state}
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
				{workspaceRunState && showBranchSubtitle && (
					<WorkspaceRunIndicator state={workspaceRunState} variant="inline" />
				)}
			</div>

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

	return (
		<>
			<WorkspaceContextMenu
				id={id}
				projectId={projectId}
				name={name}
				isBranchWorkspace={isBranchWorkspace}
				isUnread={isUnread}
				workspaceStatus={workspaceStatus}
				sections={sections}
				onRename={rename.startRename}
				onOpenInFinder={handleOpenInFinder}
				onCopyPath={handleCopyPath}
				onSetUnread={(unread) => setUnread.mutate({ id, isUnread: unread })}
				onResetStatus={() => resetWorkspaceStatus(id)}
				onClose={handleDeleteClick}
			>
				{content}
			</WorkspaceContextMenu>
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
