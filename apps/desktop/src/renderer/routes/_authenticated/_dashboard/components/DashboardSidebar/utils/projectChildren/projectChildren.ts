import type {
	DashboardSidebarProjectChild,
	DashboardSidebarWorkspace,
} from "../../types";

export function getProjectChildrenWorkspaces(
	children: DashboardSidebarProjectChild[],
): DashboardSidebarWorkspace[] {
	return children.flatMap((child) =>
		child.type === "workspace" ? [child.workspace] : child.section.workspaces,
	);
}
