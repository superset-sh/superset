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
		child.type === "workspace"
			? [child.workspace]
			: getSectionWorkspaces(child.section),
	);
}

/** Folders-first, matching the rendered order of a group's contents. */
function getSectionWorkspaces(
	section: DashboardSidebarSection,
): DashboardSidebarWorkspace[] {
	return [
		...section.childSections.flatMap(getSectionWorkspaces),
		...section.workspaces,
	];
}
