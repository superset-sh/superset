import {
	type KeyboardEvent,
	type MouseEvent,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { useDiffStats } from "renderer/hooks/host-service/useDiffStats";
import { useV2WorkspaceNotificationStatus } from "renderer/hooks/host-service/useV2NotificationStatus";
import { useOptimisticCollectionActions } from "renderer/routes/_authenticated/hooks/useOptimisticCollectionActions";
import { useDeletingWorkspaces } from "renderer/routes/_authenticated/providers/DeletingWorkspacesProvider";
import { RenameBranchDialog } from "renderer/screens/main/components/WorkspaceSidebar/WorkspaceListItem/components";
import { useDashboardSidebarHover } from "../../providers/DashboardSidebarHoverProvider";
import type { WorkspaceSelectionEvent } from "../../providers/DashboardSidebarSelectionProvider";
import type { DashboardSidebarWorkspace } from "../../types";
import { DashboardSidebarDeleteDialog } from "../DashboardSidebarDeleteDialog";
import { DashboardSidebarCollapsedWorkspaceButton } from "./components/DashboardSidebarCollapsedWorkspaceButton";
import { DashboardSidebarExpandedWorkspaceRow } from "./components/DashboardSidebarExpandedWorkspaceRow";
import {
	DashboardSidebarWorkspaceBulkContextMenu,
	useWorkspaceRowContextMenu,
} from "./components/DashboardSidebarWorkspaceBulkContextMenu";
import { DashboardSidebarWorkspaceContextMenu } from "./components/DashboardSidebarWorkspaceContextMenu/DashboardSidebarWorkspaceContextMenu";
import { useDashboardSidebarWorkspaceItemActions } from "./hooks/useDashboardSidebarWorkspaceItemActions";

interface DashboardSidebarWorkspaceItemProps {
	workspace: DashboardSidebarWorkspace;
	onHoverCardOpen?: () => void;
	shortcutLabel?: string;
	isCollapsed?: boolean;
	isInSection?: boolean;
	isSelected?: boolean;
	onSelectionClick?: (event: WorkspaceSelectionEvent) => boolean;
	/**
	 * Set when the row renders inside the top-level Pinned section: shows the
	 * owning project's avatar for cross-project context.
	 */
	pinnedContext?: { projectName: string; projectIconUrl: string | null };
}

export function DashboardSidebarWorkspaceItem({
	workspace,
	onHoverCardOpen,
	shortcutLabel,
	isCollapsed = false,
	isInSection = false,
	isSelected = false,
	onSelectionClick,
	pinnedContext,
}: DashboardSidebarWorkspaceItemProps) {
	const {
		id,
		projectId,
		accentColor = null,
		hostType,
		hostIsOnline,
		name,
		branch,
		pendingTransaction,
		pullRequest,
	} = workspace;
	const isMainWorkspace = workspace.type === "main";
	const workspaceStatus = useV2WorkspaceNotificationStatus(id);
	const {
		cancelRename,
		handleClearStatus,
		handleClick,
		handleCopyPath,
		handleCopyBranchName,
		handleCreateSection,
		handleDeleted,
		handleOpenInFinder,
		handleRemoveFromSidebar,
		handleRemovePullRequest,
		handleTogglePin,
		handleToggleUnread,
		isActive,
		isDeleteDialogOpen,
		isUnread,
		isRenaming,
		moveWorkspaceToSection,
		renameValue,
		setIsDeleteDialogOpen,
		setRenameValue,
		startRename,
		submitRename,
	} = useDashboardSidebarWorkspaceItemActions({
		workspaceId: id,
		projectId,
		workspaceName: name,
		branch,
		isMainWorkspace,
		isPinned: workspace.isPinned,
	});

	// Only the active workspace row shows line counts, so skip the per-item
	// git status query everywhere else.
	const diffStats = useDiffStats(id, { enabled: isActive });

	const { v2Workspaces: v2WorkspaceActions } = useOptimisticCollectionActions();
	const [renameBranchTarget, setRenameBranchTarget] = useState<string | null>(
		null,
	);
	const handleAfterBranchRename = (newBranchName: string) => {
		v2WorkspaceActions.updateWorkspace(id, { branch: newBranchName });
	};
	const isPending = pendingTransaction?.type === "insert";
	// Keep the delete dialog outside the hidden wrapper below — the destroy
	// flow reopens it into an error pane on conflict/teardown-failed.
	const isDeleting = useDeletingWorkspaces().isDeleting(id);

	const {
		hoveredId: hoverHoveredId,
		requestOpen: hoverRequestOpen,
		requestClose: hoverRequestClose,
		syncIfHovered: hoverSyncIfHovered,
	} = useDashboardSidebarHover();
	const rowRef = useRef<HTMLDivElement>(null);
	const hoverEligible = !isPending;
	const hoverPayload = useMemo(
		() => ({ workspace, onEditBranchClick: setRenameBranchTarget }),
		[workspace],
	);

	const handleMouseEnter = useCallback(
		(event: React.MouseEvent) => {
			if (!hoverEligible || !rowRef.current) return;
			hoverRequestOpen(id, rowRef.current, hoverPayload, {
				x: event.clientX,
				y: event.clientY,
			});
		},
		[hoverEligible, hoverRequestOpen, id, hoverPayload],
	);
	const handleMouseLeave = useCallback(
		(event: React.MouseEvent) => {
			if (!hoverEligible) return;
			hoverRequestClose(id, { x: event.clientX, y: event.clientY });
		},
		[hoverEligible, hoverRequestClose, id],
	);

	const isHovered = hoverHoveredId === id;
	useEffect(() => {
		if (isHovered && hostType === "local-device") onHoverCardOpen?.();
	}, [isHovered, hostType, onHoverCardOpen]);
	useEffect(() => {
		if (!isHovered) return;
		hoverSyncIfHovered(id, hoverPayload);
	}, [isHovered, hoverSyncIfHovered, id, hoverPayload]);

	const handleExpandedClick = useCallback(
		(event: MouseEvent<HTMLElement>) => {
			if (
				onSelectionClick &&
				(event.ctrlKey || event.metaKey || event.shiftKey)
			) {
				event.preventDefault();
				event.stopPropagation();
				return;
			}
			if (onSelectionClick?.(event)) return;
			handleClick();
		},
		[handleClick, onSelectionClick],
	);
	const handleExpandedMouseDown = useCallback(
		(event: MouseEvent<HTMLElement>) => {
			if (!event.ctrlKey && !event.metaKey && !event.shiftKey) return;
			if (
				event.target instanceof Element &&
				event.target.closest("button, input, textarea, [role='menuitem']")
			) {
				return;
			}
			onSelectionClick?.(event);
		},
		[onSelectionClick],
	);
	const { isBulkMenu, onRowContextMenu: handleExpandedContextMenu } =
		useWorkspaceRowContextMenu({
			isSelected,
			canBulkSelect: onSelectionClick != null,
		});
	const handleExpandedKeyboardActivate = useCallback(
		(event: KeyboardEvent<HTMLElement>) => {
			if (onSelectionClick?.(event)) return;
			handleClick();
		},
		[handleClick, onSelectionClick],
	);
	const handleWorkspaceChipsClick = useCallback(
		(event: MouseEvent<HTMLElement>) => {
			if (onSelectionClick?.(event)) return;
			handleClick();
		},
		[handleClick, onSelectionClick],
	);
	if (isCollapsed) {
		const content = (
			// biome-ignore lint/a11y/noStaticElementInteractions: hover handlers drive a non-interactive popover, no new keyboard semantics
			<div
				ref={rowRef}
				onMouseEnter={handleMouseEnter}
				onMouseLeave={handleMouseLeave}
				className="relative flex w-full justify-center"
			>
				{accentColor && (
					<div
						className="absolute inset-y-0 left-0 w-0.5"
						style={{ backgroundColor: accentColor }}
					/>
				)}
				<DashboardSidebarCollapsedWorkspaceButton
					hostType={hostType}
					workspaceType={workspace.type}
					hostIsOnline={hostIsOnline}
					isActive={isActive}
					workspaceStatus={workspaceStatus}
					onClick={handleClick}
					isCreatePending={isPending}
					pullRequestState={pullRequest?.state ?? null}
					aria-label={isPending ? `Creating workspace: ${name}` : undefined}
				/>
			</div>
		);

		return (
			<>
				<div hidden={isDeleting}>
					{isPending ? (
						content
					) : (
						<DashboardSidebarWorkspaceContextMenu
							workspaceId={id}
							projectId={projectId}
							isInSection={isInSection}
							isUnread={isUnread}
							hasStatus={!!workspaceStatus}
							hasPullRequest={!!pullRequest}
							isLocalWorkspace={hostType === "local-device"}
							isLocalMainWorkspace={
								isMainWorkspace && hostType === "local-device"
							}
							isPinned={workspace.isPinned}
							onTogglePin={handleTogglePin}
							onCreateSection={handleCreateSection}
							showDeleteHotkey={isActive}
							onMoveToSection={(targetSectionId) =>
								moveWorkspaceToSection(id, projectId, targetSectionId)
							}
							onOpenInFinder={handleOpenInFinder}
							onCopyPath={handleCopyPath}
							onCopyBranchName={handleCopyBranchName}
							onRemoveFromSidebar={handleRemoveFromSidebar}
							onRemovePullRequest={handleRemovePullRequest}
							onRename={isMainWorkspace ? undefined : startRename}
							onDelete={
								isMainWorkspace ? undefined : () => setIsDeleteDialogOpen(true)
							}
							onToggleUnread={handleToggleUnread}
							onClearStatus={handleClearStatus}
						>
							{content}
						</DashboardSidebarWorkspaceContextMenu>
					)}
				</div>

				{!isPending && !isMainWorkspace && (
					<DashboardSidebarDeleteDialog
						workspaceId={id}
						workspaceName={name || branch}
						open={isDeleteDialogOpen}
						onOpenChange={setIsDeleteDialogOpen}
						onDeleted={handleDeleted}
					/>
				)}
				{renameBranchTarget && (
					<RenameBranchDialog
						workspaceId={id}
						currentBranchName={renameBranchTarget}
						open={renameBranchTarget !== null}
						onOpenChange={(open) => {
							if (!open) setRenameBranchTarget(null);
						}}
						onAfterRename={handleAfterBranchRename}
					/>
				)}
			</>
		);
	}

	const expandedContent = (
		// biome-ignore lint/a11y/noStaticElementInteractions: hover handlers drive a non-interactive popover, no new keyboard semantics
		<div
			ref={rowRef}
			onMouseEnter={handleMouseEnter}
			onMouseLeave={handleMouseLeave}
		>
			<DashboardSidebarExpandedWorkspaceRow
				workspace={workspace}
				isActive={isActive}
				isRenaming={isRenaming}
				renameValue={renameValue}
				shortcutLabel={shortcutLabel}
				pinnedContext={pinnedContext}
				diffStats={isPending ? null : diffStats}
				workspaceStatus={workspaceStatus}
				isInSection={isInSection}
				isBulkSelectable={onSelectionClick != null}
				isSelected={isSelected}
				onClick={handleExpandedClick}
				onMouseDown={handleExpandedMouseDown}
				onContextMenu={handleExpandedContextMenu}
				onKeyboardActivate={handleExpandedKeyboardActivate}
				onWorkspaceChipsClick={handleWorkspaceChipsClick}
				onDoubleClick={isPending || isMainWorkspace ? undefined : startRename}
				onRemoveFromSidebarClick={handleRemoveFromSidebar}
				onCloseWorkspaceClick={() => setIsDeleteDialogOpen(true)}
				onRenameValueChange={setRenameValue}
				onSubmitRename={submitRename}
				onCancelRename={cancelRename}
			/>
		</div>
	);

	return (
		<>
			<div hidden={isDeleting}>
				{isPending ? (
					expandedContent
				) : isBulkMenu ? (
					<DashboardSidebarWorkspaceBulkContextMenu>
						{expandedContent}
					</DashboardSidebarWorkspaceBulkContextMenu>
				) : (
					<DashboardSidebarWorkspaceContextMenu
						workspaceId={id}
						projectId={projectId}
						isInSection={isInSection}
						isUnread={isUnread}
						hasStatus={!!workspaceStatus}
						hasPullRequest={!!pullRequest}
						onCreateSection={handleCreateSection}
						onMoveToSection={(targetSectionId) =>
							moveWorkspaceToSection(id, projectId, targetSectionId)
						}
						isLocalWorkspace={hostType === "local-device"}
						isLocalMainWorkspace={
							isMainWorkspace && hostType === "local-device"
						}
						isPinned={workspace.isPinned}
						onTogglePin={handleTogglePin}
						onOpenInFinder={handleOpenInFinder}
						showDeleteHotkey={isActive}
						onCopyPath={handleCopyPath}
						onCopyBranchName={handleCopyBranchName}
						onRemoveFromSidebar={handleRemoveFromSidebar}
						onRemovePullRequest={handleRemovePullRequest}
						onRename={isMainWorkspace ? undefined : startRename}
						onDelete={
							isMainWorkspace ? undefined : () => setIsDeleteDialogOpen(true)
						}
						onToggleUnread={handleToggleUnread}
						onClearStatus={handleClearStatus}
					>
						{expandedContent}
					</DashboardSidebarWorkspaceContextMenu>
				)}
			</div>

			{!isPending && !isMainWorkspace && (
				<DashboardSidebarDeleteDialog
					workspaceId={id}
					workspaceName={name || branch}
					open={isDeleteDialogOpen}
					onOpenChange={setIsDeleteDialogOpen}
					onDeleted={handleDeleted}
				/>
			)}
			{renameBranchTarget && (
				<RenameBranchDialog
					workspaceId={id}
					currentBranchName={renameBranchTarget}
					open={renameBranchTarget !== null}
					onOpenChange={(open) => {
						if (!open) setRenameBranchTarget(null);
					}}
					onAfterRename={handleAfterBranchRename}
				/>
			)}
		</>
	);
}
