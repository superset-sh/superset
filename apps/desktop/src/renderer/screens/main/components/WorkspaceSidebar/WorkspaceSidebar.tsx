import { useMemo } from "react";
import { useWorkspaceShortcuts } from "renderer/hooks/useWorkspaceShortcuts";
import { PortsList } from "./PortsList";
import { ProjectSection } from "./ProjectSection";
import { WorkspaceSidebarFooter } from "./WorkspaceSidebarFooter";
import { WorkspaceSidebarHeader } from "./WorkspaceSidebarHeader";

interface WorkspaceSidebarProps {
	isCollapsed?: boolean;
}

export function WorkspaceSidebar({
	isCollapsed = false,
}: WorkspaceSidebarProps) {
	const { groups } = useWorkspaceShortcuts();

	// Calculate shortcut base indices for each project group using cumulative offsets
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
		<div className="flex flex-col h-full bg-background">
			<WorkspaceSidebarHeader isCollapsed={isCollapsed} />

			<div className="flex-1 overflow-y-auto hide-scrollbar">
				{groups.map((group, index) => (
					<ProjectSection
						key={group.project.id}
						projectId={group.project.id}
						projectName={group.project.name}
						projectColor={group.project.color}
						githubOwner={group.project.githubOwner}
						mainRepoPath={group.project.mainRepoPath}
						workspaces={group.workspaces}
						shortcutBaseIndex={projectShortcutIndices[index]}
						isCollapsed={isCollapsed}
					/>
				))}

				{groups.length === 0 && !isCollapsed && (
					<div className="flex flex-col items-center justify-center h-32 text-muted-foreground text-sm">
						<span>No workspaces yet</span>
						<span className="text-xs mt-1">Add a project to get started</span>
					</div>
				)}
			</div>

			{!isCollapsed && <PortsList />}

			<WorkspaceSidebarFooter isCollapsed={isCollapsed} />
		</div>
	);
}
