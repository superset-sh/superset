import { findWorkspaceProjectId } from "../findWorkspaceProjectId";

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

export interface KeyboardNavigationPlan {
	expandProjectId: string | null;
}

export function getKeyboardNavigationPlan(
	targetWorkspaceId: string,
	groups: GroupItem[],
	isProjectCollapsed: (projectId: string) => boolean,
): KeyboardNavigationPlan {
	const projectId = findWorkspaceProjectId(targetWorkspaceId, groups);
	if (projectId === null) {
		return { expandProjectId: null };
	}
	return {
		expandProjectId: isProjectCollapsed(projectId) ? projectId : null,
	};
}
