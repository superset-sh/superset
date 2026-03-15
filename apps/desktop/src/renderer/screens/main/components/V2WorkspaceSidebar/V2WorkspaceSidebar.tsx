import { useMemo } from "react";
import { V2ProjectSection } from "./components/V2ProjectSection";
import { V2SidebarEmptyState } from "./components/V2SidebarEmptyState";
import { V2SidebarFooter } from "./components/V2SidebarFooter";
import { V2SidebarHeader } from "./components/V2SidebarHeader";
import { useV2SidebarData } from "./hooks/useV2SidebarData";
import { useV2WorkspaceShortcuts } from "./hooks/useV2WorkspaceShortcuts";

interface V2WorkspaceSidebarProps {
	isCollapsed?: boolean;
}

export function V2WorkspaceSidebar({
	isCollapsed = false,
}: V2WorkspaceSidebarProps) {
	const { groups, isEmpty, toggleProjectCollapsed } = useV2SidebarData();

	useV2WorkspaceShortcuts(groups);

	const projectIds = useMemo(() => groups.map((g) => g.id), [groups]);

	const projectShortcutIndices = useMemo(
		() =>
			groups.reduce<{ indices: number[]; cumulative: number }>(
				(acc, group) => ({
					indices: [...acc.indices, acc.cumulative],
					cumulative: acc.cumulative + group.workspaces.length,
				}),
				{ indices: [], cumulative: 0 },
			).indices,
		[groups],
	);

	return (
		<div className="flex h-full flex-col border-r border-border bg-muted/45 dark:bg-muted/35">
			<V2SidebarHeader isCollapsed={isCollapsed} />

			<div className="flex-1 overflow-y-auto hide-scrollbar">
				{isEmpty && !isCollapsed ? (
					<V2SidebarEmptyState />
				) : (
					groups.map((project, index) => (
						<V2ProjectSection
							key={project.id}
							projectId={project.id}
							projectName={project.name}
							githubOwner={project.githubOwner}
							isCollapsed={project.isCollapsed}
							isSidebarCollapsed={isCollapsed}
							workspaces={project.workspaces}
							shortcutBaseIndex={projectShortcutIndices[index]}
							index={index}
							projectIds={projectIds}
							onToggleCollapse={toggleProjectCollapsed}
						/>
					))
				)}
			</div>

			<V2SidebarFooter isCollapsed={isCollapsed} />
		</div>
	);
}
