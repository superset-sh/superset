import { useLingui } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import { toast } from "@superset/ui/sonner";
import {
	type KeyboardEvent,
	type MouseEvent,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import { useOptimisticActions } from "renderer/routes/_authenticated/hooks/useOptimisticActions";
import { RenameBranchDialog } from "renderer/screens/main/components/WorkspaceSidebar/WorkspaceListItem/components";
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
}: DashboardSidebarWorkspaceItemProps) {
	const { t } = useLingui();
	// TODO(SUPER-2116): belongs in the create-environment flow; this offers
	// itself on workspaces that are not "ready" and cannot be promoted.
	const promoteToEnvironment = cloudTrpc.environment.promote.useMutation();

	const handlePromoteToEnvironment = useCallback(() => {
		toast.promise(
			promoteToEnvironment.mutateAsync({
				cloudWorkspaceId: workspace.id,
				name: workspace.name,
			}),
			{
				loading: t({
					message: "Saving as an environment...",
				}),
				success: (created) =>
					t({
						message: `Saved "${created?.name}" as an environment`,
					}),
				error: (error) => errorMessage(error),
			},
		);
	}, [promoteToEnvironment, workspace.id, workspace.name, t]);

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
	const isSessionWorkspace = workspace.type === "session";
	const { status: workspaceStatus, diffStats } = useSidebarWorkspaceStatus(id);
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
		handleTogglePin,
		handleToggleUnread,
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
		workspaceName: name,
		branch,
		isMainWorkspace,
		isPinned: workspace.isPinned,
	});

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
							isLocalMainWorkspace={
								isMainWorkspace && hostType === "local-device"
							}
							onPromoteToEnvironment={
								hostType === "cloud" ? handlePromoteToEnvironment : undefined
							}
							isPinned={workspace.isPinned}
							onTogglePin={handleTogglePin}
							onCreateSection={handleCreateSection}
							showDeleteHotkey={isActive}
							onMoveToSection={handleMoveToSection}
							onOpenInFinder={handleOpenInFinder}
							onCopyPath={handleCopyPath}
							onCopyBranchName={handleCopyBranchName}
							onCopyWorkspaceId={handleCopyWorkspaceId}
							onRemoveFromSidebar={handleRemoveFromSidebar}
							onRemovePullRequest={handleRemovePullRequest}
							onRename={isMainWorkspace ? undefined : startRename}
							onDelete={isMainWorkspace ? undefined : requestDelete}
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
			<DashboardSidebarExpandedWorkspaceRow
				workspace={displayWorkspace}
				isActive={isActive}
				isRenaming={isRenaming}
				renameValue={renameValue}
				shortcutLabel={shortcutLabel}
				pinnedContext={pinnedContext}
				diffStats={isPending ? null : diffStats}
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
				onDoubleClick={isPending || isMainWorkspace ? undefined : startRename}
				onRemoveFromSidebarClick={handleRemoveFromSidebar}
				onCloseWorkspaceClick={requestDelete}
				onRenameValueChange={setRenameValue}
				onSubmitRename={submitRename}
				onCancelRename={cancelRename}
			/>
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
						isLocalMainWorkspace={
							isMainWorkspace && hostType === "local-device"
						}
						isPinned={workspace.isPinned}
						onTogglePin={handleTogglePin}
						onOpenInFinder={handleOpenInFinder}
						showDeleteHotkey={isActive}
						onCopyPath={handleCopyPath}
						onCopyBranchName={handleCopyBranchName}
						onCopyWorkspaceId={handleCopyWorkspaceId}
						onRemoveFromSidebar={handleRemoveFromSidebar}
						onRemovePullRequest={handleRemovePullRequest}
						onRename={isMainWorkspace ? undefined : startRename}
						onDelete={isMainWorkspace ? undefined : requestDelete}
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
