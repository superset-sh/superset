import type { Project, Workspace } from "main/lib/db/schemas";

/**
 * Returns projects with their workspaces, ordered by project.tabOrder then workspace.tabOrder
 */
export function getAllWithWorkspaces(
	allProjects: Project[],
	allWorkspaces: Workspace[],
) {
	const activeProjects = allProjects
		.filter((p) => p.tabOrder !== null)
		.sort((a, b) => a.tabOrder! - b.tabOrder!);

	return activeProjects.map((project) => {
		const projectWorkspaces = allWorkspaces
			.filter((w) => w.projectId === project.id)
			.sort((a, b) => a.tabOrder - b.tabOrder);

		return {
			...project,
			workspaces: projectWorkspaces,
		};
	});
}
