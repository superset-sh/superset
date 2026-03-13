import { computeNextTabOrder, reorderItems } from "./reorder";

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

export type ProjectChildItem =
	| {
			id: string;
			kind: "workspace";
			projectId: string;
			tabOrder: number;
	  }
	| {
			id: string;
			kind: "section";
			projectId: string;
			tabOrder: number;
	  };

function isTopLevelWorkspace(
	workspace: WorkspaceLike,
	projectSectionIds: Set<string>,
): boolean {
	return (
		workspace.sectionId === null || !projectSectionIds.has(workspace.sectionId)
	);
}

export function getProjectChildItems(
	projectId: string,
	workspaces: WorkspaceLike[],
	sections: SectionLike[],
): ProjectChildItem[] {
	const projectSections = sections.filter(
		(section) => section.projectId === projectId,
	);
	const projectSectionIds = new Set(
		projectSections.map((section) => section.id),
	);
	const topLevelWorkspaces = workspaces.filter(
		(workspace) =>
			workspace.projectId === projectId &&
			isTopLevelWorkspace(workspace, projectSectionIds),
	);

	return [
		...topLevelWorkspaces.map((workspace) => ({
			id: workspace.id,
			kind: "workspace" as const,
			projectId: workspace.projectId,
			tabOrder: workspace.tabOrder,
		})),
		...projectSections.map((section) => ({
			id: section.id,
			kind: "section" as const,
			projectId: section.projectId,
			tabOrder: section.tabOrder,
		})),
	].sort((a, b) => a.tabOrder - b.tabOrder);
}

export function computeNextProjectChildTabOrder(
	projectId: string,
	workspaces: WorkspaceLike[],
	sections: SectionLike[],
): number {
	const items = getProjectChildItems(projectId, workspaces, sections);
	return computeNextTabOrder(items.map((item) => item.tabOrder));
}

export function reorderProjectChildItems(
	items: ProjectChildItem[],
	fromIndex: number,
	toIndex: number,
): ProjectChildItem[] {
	return reorderItems(items, fromIndex, toIndex);
}
