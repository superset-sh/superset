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
 *   1. ungrouped workspaces (sectionId === null) sorted by tabOrder
 *   2. sections sorted by tabOrder, each containing its workspaces sorted by tabOrder
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

		const projectSections = sections
			.filter((s) => s.projectId === project.id)
			.sort((a, b) => a.tabOrder - b.tabOrder);

		const sectionIds = new Set(projectSections.map((s) => s.id));

		// Ungrouped workspaces: null sectionId OR orphaned (sectionId not in project)
		for (const ws of projectWorkspaces.filter(
			(w) => w.sectionId === null || !sectionIds.has(w.sectionId),
		)) {
			orderedIds.push(ws.id);
		}

		for (const section of projectSections) {
			for (const ws of projectWorkspaces.filter(
				(w) => w.sectionId === section.id,
			)) {
				orderedIds.push(ws.id);
			}
		}
	}

	return orderedIds;
}
