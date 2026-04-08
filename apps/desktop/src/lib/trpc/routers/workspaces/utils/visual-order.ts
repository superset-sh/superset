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
	lastActivityAt: number | null;
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

export function compareByActivity(a: WorkspaceLike, b: WorkspaceLike): number {
	if (a.lastActivityAt !== null && b.lastActivityAt !== null) {
		return b.lastActivityAt - a.lastActivityAt;
	}
	if (a.lastActivityAt !== null) return -1;
	if (b.lastActivityAt !== null) return 1;
	return a.tabOrder - b.tabOrder;
}

/**
 * Computes sidebar order sorted by recent activity:
 * projects sorted by their most recent workspace activity,
 * workspaces sorted by lastActivityAt DESC within each project.
 */
export function computeActivityOrder(
	projects: ProjectLike[],
	workspaces: WorkspaceLike[],
): string[] {
	const activeProjects = projects.filter((p) => p.tabOrder !== null);

	const projectMaxActivity = new Map<string, number | null>();
	for (const project of activeProjects) {
		const projectWorkspaces = workspaces.filter(
			(w) => w.projectId === project.id,
		);
		const maxActivity = projectWorkspaces.reduce<number | null>((max, w) => {
			if (w.lastActivityAt === null) return max;
			return max === null ? w.lastActivityAt : Math.max(max, w.lastActivityAt);
		}, null);
		projectMaxActivity.set(project.id, maxActivity);
	}

	const sortedProjects = activeProjects.sort((a, b) => {
		const aMax = projectMaxActivity.get(a.id) ?? null;
		const bMax = projectMaxActivity.get(b.id) ?? null;
		if (aMax !== null && bMax !== null) return bMax - aMax;
		if (aMax !== null) return -1;
		if (bMax !== null) return 1;
		return (a.tabOrder ?? 0) - (b.tabOrder ?? 0);
	});

	const orderedIds: string[] = [];

	for (const project of sortedProjects) {
		const projectWorkspaces = workspaces
			.filter((w) => w.projectId === project.id)
			.sort(compareByActivity);

		for (const workspace of projectWorkspaces) {
			orderedIds.push(workspace.id);
		}
	}

	return orderedIds;
}
