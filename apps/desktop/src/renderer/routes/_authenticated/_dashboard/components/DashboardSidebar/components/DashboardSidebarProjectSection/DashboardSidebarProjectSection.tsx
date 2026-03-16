import { cn } from "@superset/ui/utils";
import { useMemo } from "react";
import { useDashboardSidebarProjectDnD } from "../../hooks/useDashboardSidebarProjectDnD";
import type {
	DashboardSidebarSection,
	DashboardSidebarWorkspace,
} from "../../types";
import { DashboardSidebarDeleteDialog } from "../DashboardSidebarDeleteDialog";
import { DashboardSidebarCollapsedProjectContent } from "./components/DashboardSidebarCollapsedProjectContent";
import { DashboardSidebarExpandedProjectContent } from "./components/DashboardSidebarExpandedProjectContent";
import { DashboardSidebarProjectContextMenu } from "./components/DashboardSidebarProjectContextMenu";
import { DashboardSidebarProjectRow } from "./components/DashboardSidebarProjectRow";
import { useDashboardSidebarProjectSectionActions } from "./hooks/useDashboardSidebarProjectSectionActions";
import { countProjectWorkspaces } from "./utils/countProjectWorkspaces";

interface DashboardSidebarProjectSectionProps {
	projectId: string;
	projectName: string;
	githubOwner: string | null;
	isCollapsed: boolean;
	isSidebarCollapsed?: boolean;
	workspaces: DashboardSidebarWorkspace[];
	sections: DashboardSidebarSection[];
	workspaceShortcutLabels: Map<string, string>;
	index: number;
	projectIds: string[];
	onToggleCollapse: (projectId: string) => void;
}

export function DashboardSidebarProjectSection({
	projectId,
	projectName,
	githubOwner,
	isCollapsed,
	isSidebarCollapsed = false,
	workspaces,
	sections,
	workspaceShortcutLabels,
	index,
	projectIds,
	onToggleCollapse,
}: DashboardSidebarProjectSectionProps) {
	const { isDragging, drag, drop } = useDashboardSidebarProjectDnD({
		projectId,
		index,
		projectIds,
	});

	const topLevelWorkspaceIds = useMemo(
		() => workspaces.map((workspace) => workspace.id),
		[workspaces],
	);

	const allSections = useMemo(
		() => sections.map((section) => ({ id: section.id, name: section.name })),
		[sections],
	);

	const flattenedCollapsedWorkspaces = useMemo(
		() => [...workspaces, ...sections.flatMap((section) => section.workspaces)],
		[sections, workspaces],
	);

	const {
		cancelRename,
		deleteSection,
		handleDelete,
		handleNewSection,
		handleNewWorkspace,
		isDeleteDialogOpen,
		isDeleting,
		isRenaming,
		removeProjectFromSidebar,
		renameSection,
		renameValue,
		setIsDeleteDialogOpen,
		setRenameValue,
		startRename,
		submitRename,
		toggleSectionCollapsed,
	} = useDashboardSidebarProjectSectionActions({
		projectId,
		projectName,
		workspaces,
		sections,
	});

	const totalWorkspaceCount = countProjectWorkspaces(workspaces, sections);

	if (isSidebarCollapsed) {
		return (
			<>
				<DashboardSidebarProjectContextMenu
					id={projectId}
					onCreateSection={handleNewSection}
					onRemoveFromSidebar={() => removeProjectFromSidebar(projectId)}
					onRename={startRename}
					onDelete={() => setIsDeleteDialogOpen(true)}
				>
					<div
						ref={(node) => {
							drag(drop(node));
						}}
						className={cn("border-b border-border last:border-b-0")}
					>
						<DashboardSidebarCollapsedProjectContent
							projectId={projectId}
							projectName={projectName}
							githubOwner={githubOwner}
							isCollapsed={isCollapsed}
							isDragging={isDragging}
							totalWorkspaceCount={totalWorkspaceCount}
							workspaces={flattenedCollapsedWorkspaces}
							workspaceIds={flattenedCollapsedWorkspaces.map((item) => item.id)}
							allSections={allSections}
							workspaceShortcutLabels={workspaceShortcutLabels}
							onToggleCollapse={() => onToggleCollapse(projectId)}
						/>
					</div>
				</DashboardSidebarProjectContextMenu>

				<DashboardSidebarDeleteDialog
					open={isDeleteDialogOpen}
					onOpenChange={setIsDeleteDialogOpen}
					onConfirm={handleDelete}
					title={`Delete "${projectName}"?`}
					description="This will permanently delete the project and all its workspaces."
					isPending={isDeleting}
				/>
			</>
		);
	}

	return (
		<>
			<div
				ref={(node) => {
					drag(drop(node));
				}}
				className={cn(
					"border-b border-border last:border-b-0",
					isDragging && "opacity-30",
				)}
			>
				<DashboardSidebarProjectContextMenu
					id={projectId}
					onCreateSection={handleNewSection}
					onRemoveFromSidebar={() => removeProjectFromSidebar(projectId)}
					onRename={startRename}
					onDelete={() => setIsDeleteDialogOpen(true)}
				>
					<DashboardSidebarProjectRow
						projectName={projectName}
						githubOwner={githubOwner}
						totalWorkspaceCount={totalWorkspaceCount}
						isCollapsed={isCollapsed}
						isRenaming={isRenaming}
						renameValue={renameValue}
						onRenameValueChange={setRenameValue}
						onSubmitRename={submitRename}
						onCancelRename={cancelRename}
						onStartRename={startRename}
						onToggleCollapse={() => onToggleCollapse(projectId)}
						onNewWorkspace={handleNewWorkspace}
					/>
				</DashboardSidebarProjectContextMenu>

				<DashboardSidebarExpandedProjectContent
					projectId={projectId}
					isCollapsed={isCollapsed}
					workspaces={workspaces}
					sections={sections}
					topLevelWorkspaceIds={topLevelWorkspaceIds}
					allSections={allSections}
					workspaceShortcutLabels={workspaceShortcutLabels}
					onDeleteSection={deleteSection}
					onRenameSection={renameSection}
					onToggleSectionCollapse={toggleSectionCollapsed}
				/>
			</div>

			<DashboardSidebarDeleteDialog
				open={isDeleteDialogOpen}
				onOpenChange={setIsDeleteDialogOpen}
				onConfirm={handleDelete}
				title={`Delete "${projectName}"?`}
				description="This will permanently delete the project and all its workspaces."
				isPending={isDeleting}
			/>
		</>
	);
}
