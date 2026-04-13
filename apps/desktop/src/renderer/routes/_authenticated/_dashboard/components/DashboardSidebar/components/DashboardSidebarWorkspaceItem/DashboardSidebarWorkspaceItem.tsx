import { useNavigate } from "@tanstack/react-router";
import { useDiffStats } from "renderer/hooks/host-service/useDiffStats";
import type { DashboardSidebarWorkspace } from "../../types";
import { DashboardSidebarDeleteDialog } from "../DashboardSidebarDeleteDialog";
import { DashboardSidebarCollapsedWorkspaceButton } from "./components/DashboardSidebarCollapsedWorkspaceButton";
import { DashboardSidebarExpandedWorkspaceRow } from "./components/DashboardSidebarExpandedWorkspaceRow";
import { DashboardSidebarWorkspaceContextMenu } from "./components/DashboardSidebarWorkspaceContextMenu/DashboardSidebarWorkspaceContextMenu";
import { DashboardSidebarWorkspaceHoverCardContent } from "./components/DashboardSidebarWorkspaceHoverCardContent";
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
		name,
		branch,
		creationStatus,
	} = workspace;
	const diffStats = useDiffStats(id);
	const {
		cancelRename,
		handleClick,
		handleCopyPath,
		handleCreateSection,
		handleDelete,
		handleOpenInFinder,
		isActive,
		isDeleteDialogOpen,
		isDeleting,
		isRenaming,
		moveWorkspaceToSection,
		removeWorkspaceFromSidebar,
		renameValue,
		setIsDeleteDialogOpen,
		setRenameValue,
		startRename,
		submitRename,
	} = useDashboardSidebarWorkspaceItemActions({
		workspaceId: id,
		projectId,
		workspaceName: name,
	});

	const navigate = useNavigate();
	const isPending = !!creationStatus;
	const handlePendingClick = isPending
		? () => {
				void navigate({
					to: `/pending/${id}` as string,
				});
			}
		: undefined;

	if (isCollapsed) {
		const content = (
			<div className="relative flex w-full justify-center">
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
					isActive={isActive}
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
				{isPending ? (
					content
				) : (
					<DashboardSidebarWorkspaceContextMenu
						projectId={projectId}
						isInSection={isInSection}
						onHoverCardOpen={
							hostType === "local-device" ? onHoverCardOpen : undefined
						}
						hoverCardContent={
							<DashboardSidebarWorkspaceHoverCardContent
								workspace={workspace}
								diffStats={diffStats}
							/>
						}
						onCreateSection={handleCreateSection}
						onMoveToSection={(targetSectionId) =>
							moveWorkspaceToSection(id, projectId, targetSectionId)
						}
						onOpenInFinder={handleOpenInFinder}
						onCopyPath={handleCopyPath}
						onRemoveFromSidebar={() => removeWorkspaceFromSidebar(id)}
						onRename={startRename}
						onDelete={() => setIsDeleteDialogOpen(true)}
					>
						{content}
					</DashboardSidebarWorkspaceContextMenu>
				)}

				{!isPending && (
					<DashboardSidebarDeleteDialog
						open={isDeleteDialogOpen}
						onOpenChange={setIsDeleteDialogOpen}
						onConfirm={handleDelete}
						title={`Delete "${name || branch}"?`}
						description="This will permanently delete the workspace."
						isPending={isDeleting}
					/>
				)}
			</>
		);
	}

	const expandedContent = (
		<DashboardSidebarExpandedWorkspaceRow
			workspace={workspace}
			isActive={isActive}
			isRenaming={isRenaming}
			renameValue={renameValue}
			shortcutLabel={shortcutLabel}
			diffStats={isPending ? null : diffStats}
			onClick={isPending ? handlePendingClick : handleClick}
			onDoubleClick={isPending ? undefined : startRename}
			onDeleteClick={() => setIsDeleteDialogOpen(true)}
			onRenameValueChange={setRenameValue}
			onSubmitRename={submitRename}
			onCancelRename={cancelRename}
		/>
	);

	return (
		<>
			{isPending ? (
				expandedContent
			) : (
				<DashboardSidebarWorkspaceContextMenu
					projectId={projectId}
					isInSection={isInSection}
					onHoverCardOpen={
						hostType === "local-device" ? onHoverCardOpen : undefined
					}
					hoverCardContent={
						<DashboardSidebarWorkspaceHoverCardContent
							workspace={workspace}
							diffStats={diffStats}
						/>
					}
					onCreateSection={handleCreateSection}
					onMoveToSection={(targetSectionId) =>
						moveWorkspaceToSection(id, projectId, targetSectionId)
					}
					onOpenInFinder={handleOpenInFinder}
					onCopyPath={handleCopyPath}
					onRemoveFromSidebar={() => removeWorkspaceFromSidebar(id)}
					onRename={startRename}
					onDelete={() => setIsDeleteDialogOpen(true)}
				>
					{expandedContent}
				</DashboardSidebarWorkspaceContextMenu>
			)}

			{!isPending && (
				<DashboardSidebarDeleteDialog
					open={isDeleteDialogOpen}
					onOpenChange={setIsDeleteDialogOpen}
					onConfirm={handleDelete}
					title={`Delete "${name || branch}"?`}
					description="This will permanently delete the workspace."
					isPending={isDeleting}
				/>
			)}
		</>
	);
}
