import { DashboardSidebarHeader } from "./components/DashboardSidebarHeader";
import { DashboardSidebarProjectSection } from "./components/DashboardSidebarProjectSection";
import { useDashboardSidebarData } from "./hooks/useDashboardSidebarData";
import { useDashboardSidebarShortcuts } from "./hooks/useDashboardSidebarShortcuts";

interface DashboardSidebarProps {
	isCollapsed?: boolean;
}

export function DashboardSidebar({
	isCollapsed = false,
}: DashboardSidebarProps) {
	const { groups, refreshWorkspacePullRequest, toggleProjectCollapsed } =
		useDashboardSidebarData();
	const workspaceShortcutLabels = useDashboardSidebarShortcuts(groups);

	return (
		<div className="flex h-full flex-col border-r border-border bg-muted/45 dark:bg-muted/35">
			<DashboardSidebarHeader isCollapsed={isCollapsed} />

			<div className="flex-1 overflow-y-auto hide-scrollbar">
				{groups.map((project) => (
					<DashboardSidebarProjectSection
						key={project.id}
						project={project}
						isSidebarCollapsed={isCollapsed}
						workspaceShortcutLabels={workspaceShortcutLabels}
						onWorkspaceHover={refreshWorkspacePullRequest}
						onToggleCollapse={toggleProjectCollapsed}
					/>
				))}
			</div>
		</div>
	);
}
