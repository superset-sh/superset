import type {
	DashboardSidebarProjectChild,
	DashboardSidebarSection,
	DashboardSidebarWorkspace,
} from "../../types";

export function getProjectChildrenSections(
	children: DashboardSidebarProjectChild[],
): Pick<DashboardSidebarSection, "id" | "name">[] {
	return children.flatMap((child) =>
		child.type === "section"
			? [{ id: child.section.id, name: child.section.name }]
			: [],
	);
}

export function getProjectChildrenWorkspaces(
	children: DashboardSidebarProjectChild[],
): DashboardSidebarWorkspace[] {
	return children.flatMap((child) =>
		child.type === "workspace" ? [child.workspace] : child.section.workspaces,
	);
}
