import type {
	DashboardSidebarSection,
	DashboardSidebarWorkspace,
} from "../../../types";

export function countProjectWorkspaces(
	workspaces: DashboardSidebarWorkspace[],
	sections: DashboardSidebarSection[],
): number {
	return (
		workspaces.length +
		sections.reduce((sum, section) => sum + section.workspaces.length, 0)
	);
}
