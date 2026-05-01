import type { DashboardSidebarProject } from "../../types";

export interface SidebarProjectInput {
	projectId: string;
	tabOrder: number;
	isCollapsed: boolean;
}

export interface CloudProjectInput {
	id: string;
	name: string;
	slug: string;
	githubRepositoryId: string | null;
	createdAt: Date;
	updatedAt: Date;
}

export interface GithubRepoInput {
	id: string;
	owner: string;
	name: string;
}

export type JoinedSidebarProject = Omit<DashboardSidebarProject, "children">;

// Left-join, not inner-join: a sidebar entry for a freshly-created project
// must show up immediately, even when Electric has not yet synced the
// matching v2_projects row (issue #3818). When the cloud row arrives,
// the live query refreshes and these placeholder fields fill in.
export function joinSidebarProjects(
	sidebarProjects: readonly SidebarProjectInput[],
	cloudProjects: readonly CloudProjectInput[],
	githubRepos: readonly GithubRepoInput[],
): JoinedSidebarProject[] {
	const projectsById = new Map(cloudProjects.map((p) => [p.id, p]));
	const reposById = new Map(githubRepos.map((r) => [r.id, r]));

	return [...sidebarProjects]
		.sort((left, right) => left.tabOrder - right.tabOrder)
		.map((sidebar) => {
			const project = projectsById.get(sidebar.projectId);
			const repo =
				project?.githubRepositoryId != null
					? (reposById.get(project.githubRepositoryId) ?? null)
					: null;

			return {
				id: sidebar.projectId,
				name: project?.name ?? "",
				slug: project?.slug ?? "",
				githubRepositoryId: project?.githubRepositoryId ?? null,
				githubOwner: repo?.owner ?? null,
				githubRepoName: repo?.name ?? null,
				createdAt: project?.createdAt ?? new Date(0),
				updatedAt: project?.updatedAt ?? new Date(0),
				isCollapsed: sidebar.isCollapsed,
			};
		});
}
