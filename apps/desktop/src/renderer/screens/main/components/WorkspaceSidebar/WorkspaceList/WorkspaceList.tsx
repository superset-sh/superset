import type { SidebarSection, SidebarWorkspace } from "../types";
import { WorkspaceListItem } from "../WorkspaceListItem";

interface WorkspaceListProps {
	workspaces: SidebarWorkspace[];
	shortcutBaseIndex: number;
	sectionId: string | null;
	sections: Pick<SidebarSection, "id" | "name">[];
	isCollapsed?: boolean;
	orderedWorkspaceIds?: string[];
}

export function WorkspaceList({
	workspaces,
	shortcutBaseIndex,
	sectionId,
	sections,
	isCollapsed,
	orderedWorkspaceIds,
}: WorkspaceListProps) {
	return (
		<>
			{workspaces.map((workspace, wsIndex) => (
				<WorkspaceListItem
					key={workspace.id}
					id={workspace.id}
					projectId={workspace.projectId}
					worktreePath={workspace.worktreePath}
					name={workspace.name}
					branch={workspace.branch}
					type={workspace.type}
					isUnread={workspace.isUnread}
					index={wsIndex}
					shortcutIndex={shortcutBaseIndex + wsIndex}
					isCollapsed={isCollapsed}
					sectionId={sectionId}
					sections={sections}
					orderedWorkspaceIds={orderedWorkspaceIds}
				/>
			))}
		</>
	);
}
