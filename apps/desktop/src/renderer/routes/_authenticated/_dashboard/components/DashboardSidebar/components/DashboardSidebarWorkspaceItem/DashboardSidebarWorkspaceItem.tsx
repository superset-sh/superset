import { useLingui } from "@lingui/react/macro";
import {
	type KeyboardEvent,
	type MouseEvent,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { useOptimisticActions } from "renderer/routes/_authenticated/hooks/useOptimisticActions";
import { RenameBranchDialog } from "renderer/screens/main/components/WorkspaceSidebar/WorkspaceListItem/components";
import { useIsNewDashboardSidebar } from "../../hooks/useNewDashboardSidebarEnabled";
import {
	useDashboardSidebarHoverActions,
	useDashboardSidebarIsHovered,
} from "../../providers/DashboardSidebarHoverProvider";
import type { WorkspaceSelectionEvent } from "../../providers/DashboardSidebarSelectionProvider";
import { useSidebarWorkspaceStatus } from "../../providers/DashboardSidebarWorkspaceStatusProvider";
import type {
	DashboardSidebarWorkspace,
	DashboardSidebarWorkspaceIndentation,
} from "../../types";
import { DashboardSidebarCollapsedWorkspaceButton } from "./components/DashboardSidebarCollapsedWorkspaceButton";
import { DashboardSidebarExpandedWorkspaceRow } from "./components/DashboardSidebarExpandedWorkspaceRow";
import { DashboardSidebarLegacyExpandedWorkspaceRow } from "./components/DashboardSidebarLegacyExpandedWorkspaceRow";
import {
	DashboardSidebarWorkspaceBulkContextMenu,
	useWorkspaceRowContextMenu,
} from "./components/DashboardSidebarWorkspaceBulkContextMenu";
import { DashboardSidebarWorkspaceContextMenu } from "./components/DashboardSidebarWorkspaceContextMenu/DashboardSidebarWorkspaceContextMenu";
import { useDashboardSidebarWorkspaceItemActions } from "./hooks/useDashboardSidebarWorkspaceItemActions";

interface DashboardSidebarWorkspaceItemProps {
	workspace: DashboardSidebarWorkspace;
	onHoverCardOpen?: (workspaceId: string) => void | Promise<void>;
	shortcutLabel?: string;
	isCollapsed?: boolean;
	isInSection?: boolean;
	indentation?: DashboardSidebarWorkspaceIndentation;
	isSelected?: boolean;
	onSelectionClick?: (event: WorkspaceSelectionEvent) => boolean;
	/**
	 * Set when the row renders inside the top-level Pinned section: shows the
	 * owning project's avatar for cross-project context.
	 */
	/** projectName is null for pinned project-less "session" workspaces. */
	pinnedContext?: { projectName: string | null; projectIconUrl: string | null };
	/** Set when the row renders inside the Snoozed section. */
	snoozedUntil?: number;
}

export function DashboardSidebarWorkspaceItem({
	workspace,
	onHoverCardOpen,
	shortcutLabel,
	isCollapsed = false,
	isInSection = false,
	indentation,
	isSelected = false,
	onSelectionClick,
	pinnedContext,
	snoozedUntil,
}: DashboardSidebarWorkspaceItemProps) {
	const { t } = useLingui();
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
		isMine,
	} = workspace;
	const isSessionWorkspace = workspace.type === "session";
	const isCloudWorkspace = hostType === "cloud";
	const { status: workspaceStatus, diffStats } = useSidebarWorkspaceStatus(id);
	const isNewSidebar = useIsNewDashboardSidebar();
	const {
		cancelRename,
		pendingName,
		handleClearStatus,
		handleClick,
		handleCopyPath,
		handleCopyBranchName,
		handleCopyWorkspaceId,
		handleCreateSection,
		handleMoveToSection,
		handleOpenInFinder,
		handleRemoveFromSidebar,
		handleRemovePullRequest,
		handleSnooze,
		handleTogglePin,
		handleToggleUnread,
		handleUnsnooze,
		isActive,
		isUnread,
		isRenaming,
		renameValue,
		requestDelete,
		setRenameValue,
		startRename,
		submitRename,
	} = useDashboardSidebarWorkspaceItemActions({
		workspaceId: id,
		projectId,
		isSessionWorkspace,
		isCloudWorkspace,
		workspaceName: name,
		branch,
		isPinned: workspace.isPinned,
	});
	// A cloud workspace you created is in the sidebar by definition; only an
	// opted-in teammate's can be taken back out.
	const removeFromSidebarIfAllowed =
		isCloudWorkspace && isMine ? undefined : handleRemoveFromSidebar;

	// Renders the submitted name until the store reports it, so the row never
	// falls back to the pre-rename value for a frame.
	const displayWorkspace = useMemo(
		() =>
			pendingName === null ? workspace : { ...workspace, name: pendingName },
		[pendingName, workspace],
	);

	const { v2Workspaces: v2WorkspaceActions } = useOptimisticActions();
	const [renameBranchTarget, setRenameBranchTarget] = useState<string | null>(
		null,
	);
	const handleAfterBranchRename = (newBranchName: string) => {
		v2WorkspaceActions.updateWorkspace(id, { branch: newBranchName });
	};
	const isPending = pendingTransaction?.type === "insert";

	const {
		requestOpen: hoverRequestOpen,
		requestClose: hoverRequestClose,
		syncIfHovered: hoverSyncIfHovered,
	} = useDashboardSidebarHoverActions();
	const rowRef = useRef<HTMLDivElement>(null);
	const hoverEligible = !isPending;
	const hoverPayload = useMemo(
		() => ({
			workspace,
			onEditBranchClick: isCloudWorkspace ? undefined : setRenameBranchTarget,
		}),
		[workspace, isCloudWorkspace],
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

	const isHovered = useDashboardSidebarIsHovered(id);
	useEffect(() => {
		// Fires on the committed hover only (hoveredId set after OPEN_DELAY or an
		// open-card switch), never on transient row mouseenter.
		if (isHovered && hostType === "local-device") void onHoverCardOpen?.(id);
	}, [isHovered, hostType, onHoverCardOpen, id]);
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
					aria-label={
						isPending
							? workspace.type === "session"
								? t({
										message: `Creating session: ${name}`,
									})
								: t({
										message: `Creating workspace: ${name}`,
									})
							: undefined
					}
				/>
			</div>
		);

		return (
			<>
				<div>
					{isPending ? (
						content
					) : (
						<DashboardSidebarWorkspaceContextMenu
							workspaceId={id}
							projectId={projectId}
							isSessionWorkspace={isSessionWorkspace}
							isInSection={isInSection}
							isUnread={isUnread}
							hasStatus={!!workspaceStatus}
							hasPullRequest={!!pullRequest}
							isLocalWorkspace={hostType === "local-device"}
							isCloudWorkspace={isCloudWorkspace}
							isPinned={workspace.isPinned}
							snoozedUntil={snoozedUntil ?? null}
							onTogglePin={handleTogglePin}
							onSnooze={handleSnooze}
							onUnsnooze={handleUnsnooze}
							onCreateSection={handleCreateSection}
							showDeleteHotkey={isActive}
							onMoveToSection={handleMoveToSection}
							onOpenInFinder={handleOpenInFinder}
							onCopyPath={handleCopyPath}
							onCopyBranchName={handleCopyBranchName}
							onCopyWorkspaceId={handleCopyWorkspaceId}
							onRemoveFromSidebar={removeFromSidebarIfAllowed}
							onRemovePullRequest={handleRemovePullRequest}
							onRename={startRename}
							onDelete={requestDelete}
							onToggleUnread={handleToggleUnread}
							onClearStatus={handleClearStatus}
						>
							{content}
						</DashboardSidebarWorkspaceContextMenu>
					)}
				</div>

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
			{isNewSidebar ? (
				<DashboardSidebarExpandedWorkspaceRow
					workspace={displayWorkspace}
					isActive={isActive}
					isRenaming={isRenaming}
					renameValue={renameValue}
					shortcutLabel={shortcutLabel}
					pinnedContext={pinnedContext}
					workspaceStatus={workspaceStatus}
					isInSection={isInSection}
					indentation={indentation}
					isBulkSelectable={onSelectionClick != null}
					isSelected={isSelected}
					onClick={handleExpandedClick}
					onMouseDown={handleExpandedMouseDown}
					onContextMenu={handleExpandedContextMenu}
					onKeyboardActivate={handleExpandedKeyboardActivate}
					onWorkspaceChipsClick={handleWorkspaceChipsClick}
					onDoubleClick={isPending ? undefined : startRename}
					onRemoveFromSidebarClick={handleRemoveFromSidebar}
					onCloseWorkspaceClick={requestDelete}
					onRenameValueChange={setRenameValue}
					onSubmitRename={submitRename}
					onCancelRename={cancelRename}
				/>
			) : (
				<DashboardSidebarLegacyExpandedWorkspaceRow
					workspace={displayWorkspace}
					isActive={isActive}
					isRenaming={isRenaming}
					renameValue={renameValue}
					shortcutLabel={shortcutLabel}
					pinnedContext={pinnedContext}
					workspaceStatus={workspaceStatus}
					isInSection={isInSection}
					indentation={indentation}
					isBulkSelectable={onSelectionClick != null}
					isSelected={isSelected}
					onClick={handleExpandedClick}
					onMouseDown={handleExpandedMouseDown}
					onContextMenu={handleExpandedContextMenu}
					onKeyboardActivate={handleExpandedKeyboardActivate}
					onWorkspaceChipsClick={handleWorkspaceChipsClick}
					onDoubleClick={isPending ? undefined : startRename}
					onRemoveFromSidebarClick={handleRemoveFromSidebar}
					onCloseWorkspaceClick={requestDelete}
					onRenameValueChange={setRenameValue}
					onSubmitRename={submitRename}
					onCancelRename={cancelRename}
					diffStats={isPending ? null : diffStats}
				/>
			)}
		</div>
	);

	return (
		<>
			<div>
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
						isSessionWorkspace={isSessionWorkspace}
						isInSection={isInSection}
						isUnread={isUnread}
						hasStatus={!!workspaceStatus}
						hasPullRequest={!!pullRequest}
						onCreateSection={handleCreateSection}
						onMoveToSection={handleMoveToSection}
						isLocalWorkspace={hostType === "local-device"}
						isCloudWorkspace={isCloudWorkspace}
						isPinned={workspace.isPinned}
						snoozedUntil={snoozedUntil ?? null}
						onTogglePin={handleTogglePin}
						onSnooze={handleSnooze}
						onUnsnooze={handleUnsnooze}
						onOpenInFinder={handleOpenInFinder}
						showDeleteHotkey={isActive}
						onCopyPath={handleCopyPath}
						onCopyBranchName={handleCopyBranchName}
						onCopyWorkspaceId={handleCopyWorkspaceId}
						onRemoveFromSidebar={removeFromSidebarIfAllowed}
						onRemovePullRequest={handleRemovePullRequest}
						onRename={startRename}
						onDelete={requestDelete}
						onToggleUnread={handleToggleUnread}
						onClearStatus={handleClearStatus}
					>
						{expandedContent}
					</DashboardSidebarWorkspaceContextMenu>
				)}
			</div>

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
