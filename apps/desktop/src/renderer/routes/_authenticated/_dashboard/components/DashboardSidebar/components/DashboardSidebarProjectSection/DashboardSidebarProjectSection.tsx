import type {
	DraggableAttributes,
	DraggableSyntheticListeners,
} from "@dnd-kit/core";
import { AnimatePresence, motion } from "framer-motion";
import { useMemo } from "react";
import { DeleteProjectDialog } from "renderer/routes/_authenticated/components/DeleteProjectDialog";
import type { DashboardSidebarProject } from "../../types";
import { getProjectChildrenWorkspaces } from "../../utils/projectChildren";
import { DashboardSidebarCollapsedProjectContent } from "./components/DashboardSidebarCollapsedProjectContent";
import { DashboardSidebarExpandedProjectContent } from "./components/DashboardSidebarExpandedProjectContent";
import { DashboardSidebarProjectContextMenu } from "./components/DashboardSidebarProjectContextMenu";
import { DashboardSidebarProjectRow } from "./components/DashboardSidebarProjectRow";
import { ImportWorktreesDialog } from "./components/ImportWorktreesDialog";
import { useDashboardSidebarProjectSectionActions } from "./hooks/useDashboardSidebarProjectSectionActions";

interface DashboardSidebarProjectSectionProps {
	project: DashboardSidebarProject;
	isSidebarCollapsed?: boolean;
	isDraggingProject?: boolean;
	workspaceShortcutLabels: Map<string, string>;
	onWorkspaceHover: (workspaceId: string) => void | Promise<void>;
	onToggleCollapse: (projectId: string) => void;
	dragHandleListeners?: DraggableSyntheticListeners;
	dragHandleAttributes?: DraggableAttributes;
}

export function DashboardSidebarProjectSection({
	project,
	isSidebarCollapsed = false,
	isDraggingProject = false,
	workspaceShortcutLabels,
	onWorkspaceHover,
	onToggleCollapse,
	dragHandleListeners,
	dragHandleAttributes,
}: DashboardSidebarProjectSectionProps) {
	const flattenedCollapsedWorkspaces = useMemo(
		() => getProjectChildrenWorkspaces(project.children),
		[project.children],
	);

	const {
		canDeleteProject,
		cancelRename,
		confirmImportWorktrees,
		deleteSection,
		handleImportWorktrees,
		handleNewSection,
		hideProject,
		isDeleteDialogOpen,
		leaveProjectIfActive,
		openDeleteDialog,
		projectHostIds,
		setIsDeleteDialogOpen,
		handleNewWorkspace,
		handleOpenInFinder,
		handleOpenSettings,
		importableWorktrees,
		isImportingWorktrees,
		isRenaming,
		renameSection,
		renameValue,
		setImportableWorktrees,
		setRenameValue,
		startRename,
		submitRename,
		toggleSectionCollapsed,
	} = useDashboardSidebarProjectSectionActions({
		project,
	});

	const totalWorkspaceCount = flattenedCollapsedWorkspaces.length;

	const deleteProjectDialog = canDeleteProject && (
		<DeleteProjectDialog
			open={isDeleteDialogOpen}
			onOpenChange={setIsDeleteDialogOpen}
			projectId={project.id}
			projectName={project.name}
			hostIds={projectHostIds}
			onDeleted={leaveProjectIfActive}
		/>
	);

	// Rendered only while open so the checkbox state resets per invocation.
	const importWorktreesDialog = importableWorktrees && (
		<ImportWorktreesDialog
			open
			worktrees={importableWorktrees}
			isImporting={isImportingWorktrees}
			onOpenChange={(open) => {
				if (!open) setImportableWorktrees(null);
			}}
			onConfirm={confirmImportWorktrees}
		/>
	);

	if (isSidebarCollapsed) {
		return (
			<DashboardSidebarProjectContextMenu
				projectId={project.id}
				onCreateSection={handleNewSection}
				onImportWorktrees={handleImportWorktrees}
				onOpenInFinder={handleOpenInFinder}
				onOpenSettings={handleOpenSettings}
				onHide={hideProject}
				onDelete={canDeleteProject ? openDeleteDialog : null}
				onRename={startRename}
			>
				<div className="mt-1 first:mt-0">
					<DashboardSidebarCollapsedProjectContent
						projectId={project.id}
						projectName={project.name}
						iconUrl={project.iconUrl}
						projectColor={project.color}
						isCollapsed={project.isCollapsed}
						totalWorkspaceCount={totalWorkspaceCount}
						workspaceShortcutLabels={workspaceShortcutLabels}
						onWorkspaceHover={onWorkspaceHover}
						onToggleCollapse={() => onToggleCollapse(project.id)}
					/>
					{importWorktreesDialog}
					{deleteProjectDialog}
				</div>
			</DashboardSidebarProjectContextMenu>
		);
	}

	return (
		<div className="mt-1 first:mt-0">
			<DashboardSidebarProjectContextMenu
				projectId={project.id}
				onCreateSection={handleNewSection}
				onImportWorktrees={handleImportWorktrees}
				onOpenInFinder={handleOpenInFinder}
				onOpenSettings={handleOpenSettings}
				onHide={hideProject}
				onDelete={canDeleteProject ? openDeleteDialog : null}
				onRename={startRename}
			>
				<DashboardSidebarProjectRow
					projectName={project.name}
					iconUrl={project.iconUrl}
					projectColor={project.color}
					isCollapsed={project.isCollapsed}
					isRenaming={isRenaming}
					renameValue={renameValue}
					onRenameValueChange={setRenameValue}
					onSubmitRename={submitRename}
					onCancelRename={cancelRename}
					onStartRename={startRename}
					onToggleCollapse={() => onToggleCollapse(project.id)}
					onNewWorkspace={handleNewWorkspace}
					{...(dragHandleAttributes ?? {})}
					{...(dragHandleListeners ?? {})}
				/>
			</DashboardSidebarProjectContextMenu>

			<AnimatePresence initial={false}>
				{!isDraggingProject && (
					<motion.div
						initial={{ height: 0, opacity: 0 }}
						animate={{ height: "auto", opacity: 1 }}
						exit={{ height: 0, opacity: 0 }}
						transition={{ duration: 0.15, ease: "easeOut" }}
						className="overflow-hidden"
					>
						<DashboardSidebarExpandedProjectContent
							containerId={project.id}
							projectId={project.id}
							isCollapsed={project.isCollapsed}
							workspaceShortcutLabels={workspaceShortcutLabels}
							onWorkspaceHover={onWorkspaceHover}
							onDeleteSection={deleteSection}
							onRenameSection={renameSection}
							onToggleSectionCollapse={toggleSectionCollapsed}
						/>
					</motion.div>
				)}
			</AnimatePresence>
			{importWorktreesDialog}
			{deleteProjectDialog}
		</div>
	);
}
