import type { DashboardSidebarWorkspace } from "../../types";
import { DashboardSidebarDeleteDialog } from "../DashboardSidebarDeleteDialog";
import { DashboardSidebarCollapsedWorkspaceButton } from "./components/DashboardSidebarCollapsedWorkspaceButton";
import { DashboardSidebarExpandedWorkspaceRow } from "./components/DashboardSidebarExpandedWorkspaceRow";
import { DashboardSidebarWorkspaceContextMenu } from "./components/DashboardSidebarWorkspaceContextMenu/DashboardSidebarWorkspaceContextMenu";
import { DashboardSidebarWorkspaceHoverCardContent } from "./components/DashboardSidebarWorkspaceHoverCardContent";
import { useDashboardSidebarWorkspaceItemActions } from "./hooks/useDashboardSidebarWorkspaceItemActions";
import { getWorkspaceRowMocks } from "./utils";

interface DashboardSidebarWorkspaceItemProps {
	workspace: DashboardSidebarWorkspace;
	onHoverCardOpen?: () => void;
	shortcutLabel?: string;
	isCollapsed?: boolean;
}

export function DashboardSidebarWorkspaceItem({
	workspace,
	onHoverCardOpen,
	shortcutLabel,
	isCollapsed = false,
}: DashboardSidebarWorkspaceItemProps) {
	const {
		id,
		projectId,
		accentColor = null,
		hostType,
		name,
		branch,
	} = workspace;
	const mockData = getWorkspaceRowMocks(id);
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

	if (isCollapsed) {
		return (
			<>
				<DashboardSidebarWorkspaceContextMenu
					projectId={projectId}
					onHoverCardOpen={
						hostType === "local-device" ? onHoverCardOpen : undefined
					}
					hoverCardContent={
						<DashboardSidebarWorkspaceHoverCardContent
							workspace={workspace}
							mockData={mockData}
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
							onClick={handleClick}
							workspaceStatus={mockData.workspaceStatus}
						/>
					</div>
				</DashboardSidebarWorkspaceContextMenu>

				<DashboardSidebarDeleteDialog
					open={isDeleteDialogOpen}
					onOpenChange={setIsDeleteDialogOpen}
					onConfirm={handleDelete}
					title={`Delete "${name || branch}"?`}
					description="This will permanently delete the workspace."
					isPending={isDeleting}
				/>
			</>
		);
	}

	return (
		<>
			<DashboardSidebarWorkspaceContextMenu
				projectId={projectId}
				onHoverCardOpen={
					hostType === "local-device" ? onHoverCardOpen : undefined
				}
				hoverCardContent={
					<DashboardSidebarWorkspaceHoverCardContent
						workspace={workspace}
						mockData={mockData}
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
				<DashboardSidebarExpandedWorkspaceRow
					workspace={workspace}
					isActive={isActive}
					isRenaming={isRenaming}
					renameValue={renameValue}
					shortcutLabel={shortcutLabel}
					mockData={mockData}
					onClick={handleClick}
					onDoubleClick={startRename}
					onDeleteClick={() => setIsDeleteDialogOpen(true)}
					onRenameValueChange={setRenameValue}
					onSubmitRename={submitRename}
					onCancelRename={cancelRename}
				/>
			</DashboardSidebarWorkspaceContextMenu>

			<DashboardSidebarDeleteDialog
				open={isDeleteDialogOpen}
				onOpenChange={setIsDeleteDialogOpen}
				onConfirm={handleDelete}
				title={`Delete "${name || branch}"?`}
				description="This will permanently delete the workspace."
				isPending={isDeleting}
			/>
		</>
	);
}
