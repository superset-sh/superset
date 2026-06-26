interface WorkspaceItem {
	id: string;
}

interface SectionItem {
	workspaces: WorkspaceItem[];
}

interface GroupItem {
	project: { id: string };
	workspaces: WorkspaceItem[];
	sections: SectionItem[];
}

export function findWorkspaceProjectId(
	workspaceId: string,
	groups: GroupItem[],
): string | null {
	for (const group of groups) {
		if (group.workspaces.some((workspace) => workspace.id === workspaceId)) {
			return group.project.id;
		}
		for (const section of group.sections) {
			if (
				section.workspaces.some((workspace) => workspace.id === workspaceId)
			) {
				return group.project.id;
			}
		}
	}
	return null;
}
