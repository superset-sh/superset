import type {
	DashboardSidebarProject,
	DashboardSidebarWorkspaceType,
} from "../../types";

export type SidebarProjectRow = Omit<DashboardSidebarProject, "children"> & {
	tabOrder: number;
};

export interface SidebarWorkspaceVisibilitySource {
	type: DashboardSidebarWorkspaceType;
	createdByUserId: string | null;
	hasUserHostAccess: boolean;
	hasLocalSidebarState: boolean;
}

export interface SidebarProjectWorkspaceSource {
	projectId: string;
	projectName: string;
	projectSlug: string;
	projectGithubRepositoryId: string | null;
	projectGithubOwner: string | null | undefined;
	projectGithubRepoName: string | null | undefined;
	projectIconUrl: string | null;
	projectCreatedAt: Date;
	projectUpdatedAt: Date;
}

export function shouldIncludeSidebarWorkspace(
	workspace: SidebarWorkspaceVisibilitySource,
	currentUserId: string | null,
): boolean {
	if (workspace.hasLocalSidebarState) return true;
	if (currentUserId === null) return false;
	return (
		workspace.type === "worktree" &&
		workspace.createdByUserId === currentUserId &&
		workspace.hasUserHostAccess
	);
}

export function buildSidebarProjects(
	explicitProjects: readonly SidebarProjectRow[],
	workspaces: readonly SidebarProjectWorkspaceSource[],
): Array<Omit<DashboardSidebarProject, "children">> {
	const explicitProjectIds = new Set(
		explicitProjects.map((project) => project.id),
	);
	const defaultProjects = new Map<string, SidebarProjectRow>();

	for (const workspace of workspaces) {
		if (explicitProjectIds.has(workspace.projectId)) continue;
		if (defaultProjects.has(workspace.projectId)) continue;

		defaultProjects.set(workspace.projectId, {
			id: workspace.projectId,
			name: workspace.projectName,
			slug: workspace.projectSlug,
			githubRepositoryId: workspace.projectGithubRepositoryId,
			githubOwner: workspace.projectGithubOwner ?? null,
			githubRepoName: workspace.projectGithubRepoName ?? null,
			iconUrl: workspace.projectIconUrl,
			createdAt: workspace.projectCreatedAt,
			updatedAt: workspace.projectUpdatedAt,
			isCollapsed: false,
			tabOrder: Number.MAX_SAFE_INTEGER,
		});
	}

	return [...explicitProjects, ...defaultProjects.values()]
		.sort((left, right) => {
			const orderDelta = left.tabOrder - right.tabOrder;
			if (orderDelta !== 0) return orderDelta;
			return left.name.localeCompare(right.name);
		})
		.map(({ tabOrder: _tabOrder, ...project }) => project);
}
