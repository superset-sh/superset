import { useWorkspaceShortcuts } from "renderer/hooks/useWorkspaceShortcuts";
import { ProjectSection } from "./ProjectSection";
import { WorkspaceSidebarFooter } from "./WorkspaceSidebarFooter";
import { WorkspaceSidebarHeader } from "./WorkspaceSidebarHeader";

export function WorkspaceSidebar() {
	const { groups, activeWorkspaceId } = useWorkspaceShortcuts();

	// Calculate shortcut base indices for each project group
	let shortcutIndex = 0;
	const projectShortcutIndices = groups.map((group) => {
		const baseIndex = shortcutIndex;
		shortcutIndex += group.workspaces.length;
		return baseIndex;
	});

	return (
		<div className="flex flex-col h-full bg-background">
			<WorkspaceSidebarHeader />

			<div className="flex-1 overflow-y-auto">
				{groups.map((group, index) => (
					<ProjectSection
						key={group.project.id}
						projectId={group.project.id}
						projectName={group.project.name}
						projectColor={group.project.color}
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

			<WorkspaceSidebarFooter />
		</div>
	);
}
