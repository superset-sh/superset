import { useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDiffStats } from "renderer/hooks/host-service/useDiffStats";
import { useOptimisticCollectionActions } from "renderer/routes/_authenticated/hooks/useOptimisticCollectionActions";
import { useDeletingWorkspaces } from "renderer/routes/_authenticated/providers/DeletingWorkspacesProvider";
import { RenameBranchDialog } from "renderer/screens/main/components/WorkspaceSidebar/WorkspaceListItem/components";
import { useV2WorkspaceNotificationStatus } from "renderer/stores/v2-notifications";
import { useDashboardSidebarHover } from "../../providers/DashboardSidebarHoverProvider";
import type { DashboardSidebarWorkspace } from "../../types";
import { DashboardSidebarDeleteDialog } from "../DashboardSidebarDeleteDialog";
import { DashboardSidebarCollapsedWorkspaceButton } from "./components/DashboardSidebarCollapsedWorkspaceButton";
import { DashboardSidebarExpandedWorkspaceRow } from "./components/DashboardSidebarExpandedWorkspaceRow";
import { DashboardSidebarWorkspaceContextMenu } from "./components/DashboardSidebarWorkspaceContextMenu/DashboardSidebarWorkspaceContextMenu";
import { useDashboardSidebarWorkspaceItemActions } from "./hooks/useDashboardSidebarWorkspaceItemActions";

interface DashboardSidebarWorkspaceItemProps {
	workspace: DashboardSidebarWorkspace;
	onHoverCardOpen?: () => void;
	shortcutLabel?: string;
	isCollapsed?: boolean;
	isInSection?: boolean;
}

export function DashboardSidebarWorkspaceItem({
	workspace,
	onHoverCardOpen,
	shortcutLabel,
	isCollapsed = false,
	isInSection = false,
}: DashboardSidebarWorkspaceItemProps) {
	const {
		id,
		projectId,
		accentColor = null,
		hostType,
		hostIsOnline,
		name,
		branch,
		creationStatus,
	} = workspace;
	const isMainWorkspace = workspace.type === "main";
	const diffStats = useDiffStats(id);
	const workspaceStatus = useV2WorkspaceNotificationStatus(id);
	const {
		cancelRename,
		handleClick,
		handleCopyPath,
		handleCopyBranchName,
		handleCreateSection,
		handleDeleted,
		handleOpenInFinder,
		handleRemoveFromSidebar,
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
	});

	const navigate = useNavigate();
	const { v2Workspaces: v2WorkspaceActions } = useOptimisticCollectionActions();
	const [renameBranchTarget, setRenameBranchTarget] = useState<string | null>(
		null,
	);
	const handleAfterBranchRename = (newBranchName: string) => {
		v2WorkspaceActions.updateWorkspace(id, { branch: newBranchName });
	};
	const isPending = !!creationStatus;
	// Keep the delete dialog outside the hidden wrapper below — the destroy
	// flow reopens it into an error pane on conflict/teardown-failed.
	const isDeleting = useDeletingWorkspaces().isDeleting(id);
	const handlePendingClick = isPending
		? () => {
				void navigate({
					to: `/pending/${id}` as string,
				});
			}
		: undefined;

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

	const handleMouseEnter = useCallback(() => {
		if (!hoverEligible || !rowRef.current) return;
		hoverRequestOpen(id, rowRef.current, hoverPayload);
	}, [hoverEligible, hoverRequestOpen, id, hoverPayload]);
	const handleMouseLeave = useCallback(() => {
		if (!hoverEligible) return;
		hoverRequestClose(id);
	}, [hoverEligible, hoverRequestClose, id]);

	const isHovered = hoverHoveredId === id;
	useEffect(() => {
		if (isHovered && hostType === "local-device") onHoverCardOpen?.();
	}, [isHovered, hostType, onHoverCardOpen]);
	useEffect(() => {
		if (!isHovered) return;
		hoverSyncIfHovered(id, hoverPayload);
	}, [isHovered, hoverSyncIfHovered, id, hoverPayload]);

	if (isCollapsed) {
		const content = (
			// biome-ignore lint/a11y/noStaticElementInteractions: hover handlers drive a non-interactive popover, no new keyboard semantics
			<div
				ref={rowRef}
				onMouseEnter={handleMouseEnter}
				onMouseLeave={handleMouseLeave}
				className="relative flex w-full justify-center"
			>
				{(accentColor || isActive) && (
					<div
						className="absolute inset-y-0 left-0 w-0.5"
						style={{
							backgroundColor: accentColor ?? "var(--color-foreground)",
						}}
					/>
				)}
				<DashboardSidebarCollapsedWorkspaceButton
					hostType={hostType}
					workspaceType={workspace.type}
					hostIsOnline={hostIsOnline}
					isActive={isActive}
					workspaceStatus={workspaceStatus}
					onClick={isPending ? handlePendingClick : handleClick}
					creationStatus={creationStatus}
					disabled={isPending}
					aria-label={
						creationStatus ? `Creating workspace: ${name}` : undefined
					}
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
							projectId={projectId}
							isInSection={isInSection}
							isUnread={isUnread}
							isLocalWorkspace={hostType === "local-device"}
							onCreateSection={handleCreateSection}
							onMoveToSection={(targetSectionId) =>
								moveWorkspaceToSection(id, projectId, targetSectionId)
							}
							onOpenInFinder={handleOpenInFinder}
							onCopyPath={handleCopyPath}
							onCopyBranchName={handleCopyBranchName}
							onRemoveFromSidebar={handleRemoveFromSidebar}
							onRename={startRename}
							onDelete={
								isMainWorkspace ? undefined : () => setIsDeleteDialogOpen(true)
							}
							onToggleUnread={handleToggleUnread}
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
				diffStats={isPending ? null : diffStats}
				workspaceStatus={workspaceStatus}
				onClick={isPending ? handlePendingClick : handleClick}
				onDoubleClick={isPending ? undefined : startRename}
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
				) : (
					<DashboardSidebarWorkspaceContextMenu
						projectId={projectId}
						isInSection={isInSection}
						isUnread={isUnread}
						onCreateSection={handleCreateSection}
						onMoveToSection={(targetSectionId) =>
							moveWorkspaceToSection(id, projectId, targetSectionId)
						}
						isLocalWorkspace={hostType === "local-device"}
						onOpenInFinder={handleOpenInFinder}
						onCopyPath={handleCopyPath}
						onCopyBranchName={handleCopyBranchName}
						onRemoveFromSidebar={handleRemoveFromSidebar}
						onRename={startRename}
						onDelete={
							isMainWorkspace ? undefined : () => setIsDeleteDialogOpen(true)
						}
						onToggleUnread={handleToggleUnread}
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
