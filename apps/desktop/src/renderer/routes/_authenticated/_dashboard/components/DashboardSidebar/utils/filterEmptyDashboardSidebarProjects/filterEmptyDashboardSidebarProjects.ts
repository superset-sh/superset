import type {
	DashboardSidebarPinnedWorkspace,
	DashboardSidebarProject,
	DashboardSidebarProjectChild,
} from "../../types";

interface ProjectOccupancy {
	/** Pinned rows render in the Pinned section, outside their project. */
	pinnedWorkspaces: Pick<DashboardSidebarPinnedWorkspace, "projectId">[];
	/** Projects that can hold a workspace the sidebar does not show yet. */
	unsettledProjectIds: readonly string[];
	/** False until the workspaces and their placement are known. */
	isReady: boolean;
}

function hasWorkspace(children: DashboardSidebarProjectChild[]): boolean {
	return children.some(
		(child) =>
			child.type === "workspace" || child.section.workspaces.length > 0,
	);
}

/**
 * Drops each project that has no workspace: none in its rows or folders, none
 * pinned, and none that may be there but is not shown yet. Give it the projects before any
 * host or text filter, so a project is judged by all of its workspaces. While
 * `isReady` is false, every project stays. When nothing is dropped, the input
 * array is returned as is.
 */
export function filterEmptyDashboardSidebarProjects(
	projects: DashboardSidebarProject[],
	{ pinnedWorkspaces, unsettledProjectIds, isReady }: ProjectOccupancy,
): { projects: DashboardSidebarProject[]; hiddenCount: number } {
	if (!isReady) return { projects, hiddenCount: 0 };
	const occupiedIds = new Set<string | null>([
		...pinnedWorkspaces.map((workspace) => workspace.projectId),
		...unsettledProjectIds,
	]);
	const occupied = projects.filter(
		(project) => hasWorkspace(project.children) || occupiedIds.has(project.id),
	);
	const hiddenCount = projects.length - occupied.length;
	return { projects: hiddenCount === 0 ? projects : occupied, hiddenCount };
}
