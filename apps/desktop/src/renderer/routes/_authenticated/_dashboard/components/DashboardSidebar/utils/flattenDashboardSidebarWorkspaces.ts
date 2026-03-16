import type {
	DashboardSidebarProject,
	DashboardSidebarWorkspace,
} from "../types";

export function flattenDashboardSidebarWorkspaces(
	groups: DashboardSidebarProject[],
): DashboardSidebarWorkspace[] {
	return groups.flatMap((group) => [
		...group.workspaces,
		...group.sections.flatMap((section) => section.workspaces),
	]);
}
