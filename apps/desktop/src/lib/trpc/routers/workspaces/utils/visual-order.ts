import { getProjectChildItems } from "./project-children-order";

interface ProjectLike {
	id: string;
	tabOrder: number | null;
}

interface WorkspaceLike {
	id: string;
	projectId: string;
	sectionId: string | null;
	tabOrder: number;
}

interface SectionLike {
	id: string;
	projectId: string;
	tabOrder: number;
}

/**
 * Computes the visual sidebar order of workspace IDs:
 * projects sorted by tabOrder, then within each project:
 *   1. top-level project children (ungrouped workspaces + sections) sorted by shared tabOrder
 *   2. section workspaces sorted by tabOrder within each section
 */
export function computeVisualOrder(
	projects: ProjectLike[],
	workspaces: WorkspaceLike[],
	sections: SectionLike[],
): string[] {
	const activeProjects = projects
		.filter((p) => p.tabOrder !== null)
		.sort((a, b) => (a.tabOrder ?? 0) - (b.tabOrder ?? 0));

	const orderedIds: string[] = [];

	for (const project of activeProjects) {
		const projectWorkspaces = workspaces
			.filter((w) => w.projectId === project.id)
			.sort((a, b) => a.tabOrder - b.tabOrder);
		const topLevelItems = getProjectChildItems(
			project.id,
			projectWorkspaces,
			sections,
		);

		for (const item of topLevelItems) {
			if (item.kind === "workspace") {
				orderedIds.push(item.id);
				continue;
			}
			for (const workspace of projectWorkspaces.filter(
				(w) => w.sectionId === item.id,
			)) {
				orderedIds.push(workspace.id);
			}
		}
	}

	return orderedIds;
}
