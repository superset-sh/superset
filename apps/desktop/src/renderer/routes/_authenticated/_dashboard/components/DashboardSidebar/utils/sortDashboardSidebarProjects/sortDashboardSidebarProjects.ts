import type { SidebarProjectSortMode } from "renderer/routes/_authenticated/providers/CollectionsProvider/dashboardSidebarLocal/schema";
import type { DashboardSidebarProject } from "../../types";
import { getProjectChildrenWorkspaces } from "../projectChildren";

// The host only bumps a project's own updatedAt on metadata patches (e.g.
// rename), so "recent activity" comes from the workspaces inside it.
export function getProjectActivityTimestamp(
	project: DashboardSidebarProject,
): number {
	const workspaces = getProjectChildrenWorkspaces(project.children);
	if (workspaces.length === 0) {
		return project.updatedAt?.getTime() ?? project.createdAt.getTime();
	}
	return Math.max(
		...workspaces.map((workspace) => workspace.updatedAt.getTime()),
	);
}

function compareStable(
	left: DashboardSidebarProject,
	right: DashboardSidebarProject,
	byTimestamp: (project: DashboardSidebarProject) => number,
): number {
	const diff = byTimestamp(right) - byTimestamp(left);
	if (diff !== 0) return diff;
	const byName = left.name.localeCompare(right.name);
	if (byName !== 0) return byName;
	return left.id.localeCompare(right.id);
}

export function sortDashboardSidebarProjects(
	projects: DashboardSidebarProject[],
	mode: SidebarProjectSortMode,
): DashboardSidebarProject[] {
	if (mode === "manual") return projects;
	if (mode === "created") {
		return [...projects].sort((left, right) =>
			compareStable(left, right, (project) => project.createdAt.getTime()),
		);
	}
	return [...projects].sort((left, right) =>
		compareStable(left, right, getProjectActivityTimestamp),
	);
}
