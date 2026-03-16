import { cn } from "@superset/ui/utils";
import { useMemo } from "react";
import type { DashboardSidebarProject } from "../../types";
import {
	getProjectChildrenSections,
	getProjectChildrenWorkspaces,
} from "../../utils/projectChildren";
import { DashboardSidebarCollapsedProjectContent } from "./components/DashboardSidebarCollapsedProjectContent";
import { DashboardSidebarExpandedProjectContent } from "./components/DashboardSidebarExpandedProjectContent";
import { DashboardSidebarProjectContextMenu } from "./components/DashboardSidebarProjectContextMenu";
import { DashboardSidebarProjectRow } from "./components/DashboardSidebarProjectRow";
import { useDashboardSidebarProjectSectionActions } from "./hooks/useDashboardSidebarProjectSectionActions";

interface DashboardSidebarProjectSectionProps {
	project: DashboardSidebarProject;
	isSidebarCollapsed?: boolean;
	workspaceShortcutLabels: Map<string, string>;
	onToggleCollapse: (projectId: string) => void;
}

export function DashboardSidebarProjectSection({
	project,
	isSidebarCollapsed = false,
	workspaceShortcutLabels,
	onToggleCollapse,
}: DashboardSidebarProjectSectionProps) {
	const allSections = useMemo(
		() => getProjectChildrenSections(project.children),
		[project.children],
	);

	const flattenedCollapsedWorkspaces = useMemo(
		() => getProjectChildrenWorkspaces(project.children),
		[project.children],
	);

	const {
		cancelRename,
		confirmRemoveFromSidebar,
		deleteSection,
		handleNewSection,
		handleNewWorkspace,
		handleOpenInFinder,
		handleOpenSettings,
		isRenaming,
		renameSection,
		renameValue,
		setRenameValue,
		startRename,
		submitRename,
		toggleSectionCollapsed,
	} = useDashboardSidebarProjectSectionActions({
		project,
	});

	const totalWorkspaceCount = flattenedCollapsedWorkspaces.length;

	if (isSidebarCollapsed) {
		return (
			<DashboardSidebarProjectContextMenu
				onCreateSection={handleNewSection}
				onOpenInFinder={handleOpenInFinder}
				onOpenSettings={handleOpenSettings}
				onRemoveFromSidebar={confirmRemoveFromSidebar}
				onRename={startRename}
			>
				<div className={cn("border-b border-border last:border-b-0")}>
					<DashboardSidebarCollapsedProjectContent
						projectId={project.id}
						projectName={project.name}
						githubOwner={project.githubOwner}
						isCollapsed={project.isCollapsed}
						totalWorkspaceCount={totalWorkspaceCount}
						workspaces={flattenedCollapsedWorkspaces}
						workspaceShortcutLabels={workspaceShortcutLabels}
						onToggleCollapse={() => onToggleCollapse(project.id)}
					/>
				</div>
			</DashboardSidebarProjectContextMenu>
		);
	}

	return (
		<div className={cn("border-b border-border last:border-b-0")}>
			<DashboardSidebarProjectContextMenu
				onCreateSection={handleNewSection}
				onOpenInFinder={handleOpenInFinder}
				onOpenSettings={handleOpenSettings}
				onRemoveFromSidebar={confirmRemoveFromSidebar}
				onRename={startRename}
			>
				<DashboardSidebarProjectRow
					projectName={project.name}
					githubOwner={project.githubOwner}
					totalWorkspaceCount={totalWorkspaceCount}
					isCollapsed={project.isCollapsed}
					isRenaming={isRenaming}
					renameValue={renameValue}
					onRenameValueChange={setRenameValue}
					onSubmitRename={submitRename}
					onCancelRename={cancelRename}
					onStartRename={startRename}
					onToggleCollapse={() => onToggleCollapse(project.id)}
					onNewWorkspace={handleNewWorkspace}
				/>
			</DashboardSidebarProjectContextMenu>

			<DashboardSidebarExpandedProjectContent
				projectId={project.id}
				isCollapsed={project.isCollapsed}
				projectChildren={project.children}
				allSections={allSections}
				workspaceShortcutLabels={workspaceShortcutLabels}
				onDeleteSection={deleteSection}
				onRenameSection={renameSection}
				onToggleSectionCollapse={toggleSectionCollapsed}
			/>
		</div>
	);
}
