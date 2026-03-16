import { useMemo } from "react";
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
	const { groups, toggleProjectCollapsed } = useDashboardSidebarData();

	useDashboardSidebarShortcuts(groups);

	const projectIds = useMemo(() => groups.map((g) => g.id), [groups]);

	const projectShortcutIndices = useMemo(
		() =>
			groups.reduce<{ indices: number[]; cumulative: number }>(
				(acc, group) => ({
					indices: [...acc.indices, acc.cumulative],
					cumulative:
						acc.cumulative +
						group.workspaces.length +
						group.sections.reduce(
							(sum, section) => sum + section.workspaces.length,
							0,
						),
				}),
				{ indices: [], cumulative: 0 },
			).indices,
		[groups],
	);

	return (
		<div className="flex h-full flex-col border-r border-border bg-muted/45 dark:bg-muted/35">
			<DashboardSidebarHeader isCollapsed={isCollapsed} />

			<div className="flex-1 overflow-y-auto hide-scrollbar">
				{groups.map((project, index) => (
					<DashboardSidebarProjectSection
						key={project.id}
						projectId={project.id}
						projectName={project.name}
						githubOwner={project.githubOwner}
						isCollapsed={project.isCollapsed}
						isSidebarCollapsed={isCollapsed}
						workspaces={project.workspaces}
						sections={project.sections}
						shortcutBaseIndex={projectShortcutIndices[index]}
						index={index}
						projectIds={projectIds}
						onToggleCollapse={toggleProjectCollapsed}
					/>
				))}
			</div>
		</div>
	);
}
