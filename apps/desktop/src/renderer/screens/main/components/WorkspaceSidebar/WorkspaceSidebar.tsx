import { useMemo } from "react";
import { useWorkspaceShortcuts } from "renderer/hooks/useWorkspaceShortcuts";
import { PortsList } from "./PortsList";
import { ProjectSection } from "./ProjectSection";
import { WorkspaceSidebarFooter } from "./WorkspaceSidebarFooter";
import { WorkspaceSidebarHeader } from "./WorkspaceSidebarHeader";

export function WorkspaceSidebar() {
	const { groups, activeWorkspaceId } = useWorkspaceShortcuts();

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
			<WorkspaceSidebarHeader />

			<div className="flex-1 overflow-y-auto">
				{groups.map((group, index) => (
					<ProjectSection
						key={group.project.id}
						projectId={group.project.id}
						projectName={group.project.name}
						workspaces={group.workspaces}
						activeWorkspaceId={activeWorkspaceId}
						shortcutBaseIndex={projectShortcutIndices[index]}
					/>
				))}

				{groups.length === 0 && (
					<div className="flex flex-col items-center justify-center h-32 text-muted-foreground text-sm">
						<span>No workspaces yet</span>
						<span className="text-xs mt-1">Add a project to get started</span>
					</div>
				)}
			</div>

			<PortsList />

			<WorkspaceSidebarFooter />
		</div>
	);
}
