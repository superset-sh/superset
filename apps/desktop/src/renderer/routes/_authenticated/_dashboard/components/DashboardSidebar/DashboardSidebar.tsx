import { useMemo } from "react";
import { DashboardSidebarHeader } from "./components/DashboardSidebarHeader";
import { DashboardSidebarProjectSection } from "./components/DashboardSidebarProjectSection";
import { useDashboardSidebarData } from "./hooks/useDashboardSidebarData";
import { useDashboardSidebarShortcuts } from "./hooks/useDashboardSidebarShortcuts";
import { flattenDashboardSidebarWorkspaces } from "./utils/flattenDashboardSidebarWorkspaces";
import { getWorkspaceShortcutLabels } from "./utils/getWorkspaceShortcutLabels";

interface DashboardSidebarProps {
	isCollapsed?: boolean;
}

export function DashboardSidebar({
	isCollapsed = false,
}: DashboardSidebarProps) {
	const { groups, toggleProjectCollapsed } = useDashboardSidebarData();
	const flattenedWorkspaces = useMemo(
		() => flattenDashboardSidebarWorkspaces(groups),
		[groups],
	);
	const workspaceShortcutLabels = useMemo(
		() => getWorkspaceShortcutLabels(flattenedWorkspaces),
		[flattenedWorkspaces],
	);

	useDashboardSidebarShortcuts(flattenedWorkspaces);

	return (
		<div className="flex h-full flex-col border-r border-border bg-muted/45 dark:bg-muted/35">
			<DashboardSidebarHeader isCollapsed={isCollapsed} />

			<div className="flex-1 overflow-y-auto hide-scrollbar">
				{groups.map((project) => (
					<DashboardSidebarProjectSection
						key={project.id}
						projectId={project.id}
						projectName={project.name}
						githubOwner={project.githubOwner}
						isCollapsed={project.isCollapsed}
						isSidebarCollapsed={isCollapsed}
						workspaces={project.workspaces}
						sections={project.sections}
						workspaceShortcutLabels={workspaceShortcutLabels}
						onToggleCollapse={toggleProjectCollapsed}
					/>
				))}
			</div>
		</div>
	);
}
