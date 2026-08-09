import type { AppCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider/collections";
import { getVisibleSidebarWorkspaces } from "renderer/routes/_authenticated/providers/CollectionsProvider/dashboardSidebarLocal";

type TopLevelItem =
	| { kind: "workspace"; tabOrder: number; workspaceId: string }
	| { kind: "section"; tabOrder: number; sectionId: string };

export function getFlattenedV2WorkspaceIds(
	collections: Pick<
		AppCollections,
		"v2SidebarProjects" | "v2SidebarSections" | "v2WorkspaceLocalState"
	>,
): string[] {
	const projects = Array.from(
		collections.v2SidebarProjects.state.values(),
	).sort((left, right) => left.tabOrder - right.tabOrder);
	const allSections = Array.from(collections.v2SidebarSections.state.values());
	const allWorkspaces = Array.from(
		collections.v2WorkspaceLocalState.state.values(),
	);
	const visibleWorkspaces = getVisibleSidebarWorkspaces(allWorkspaces);

	const result: string[] = [];

	// Sessions (null projectId) render in the top-level Sessions section
	// ABOVE the project groups: loose sessions first, then group trees.
	const sessionWorkspaces = visibleWorkspaces.filter(
		(workspace) => workspace.sidebarState.projectId === null,
	);
	const looseSessions = sessionWorkspaces
		.filter((workspace) => workspace.sidebarState.sectionId === null)
		.sort(
			(left, right) => left.sidebarState.tabOrder - right.sidebarState.tabOrder,
		);
	for (const workspace of looseSessions) {
		result.push(workspace.workspaceId);
	}
	const sessionRootSections = allSections
		.filter(
			(section) =>
				section.projectId === null && section.parentSectionId === null,
		)
		.sort((left, right) => left.tabOrder - right.tabOrder);
	for (const section of sessionRootSections) {
		walkSection(section.sectionId, sessionWorkspaces, allSections, result);
	}

	for (const project of projects) {
		const projectWorkspaces = visibleWorkspaces.filter(
			(workspace) => workspace.sidebarState.projectId === project.projectId,
		);
		// Root sections only — nested ones are reached through walkSection,
		// and including them here would emit their workspaces twice.
		const projectSections = allSections.filter(
			(section) =>
				section.projectId === project.projectId &&
				section.parentSectionId === null,
		);

		const topLevelItems: TopLevelItem[] = [];
		for (const workspace of projectWorkspaces) {
			if (workspace.sidebarState.sectionId == null) {
				topLevelItems.push({
					kind: "workspace",
					tabOrder: workspace.sidebarState.tabOrder,
					workspaceId: workspace.workspaceId,
				});
			}
		}
		for (const section of projectSections) {
			topLevelItems.push({
				kind: "section",
				tabOrder: section.tabOrder,
				sectionId: section.sectionId,
			});
		}
		topLevelItems.sort((left, right) => {
			if (left.tabOrder !== right.tabOrder) {
				return left.tabOrder - right.tabOrder;
			}
			if (left.kind === right.kind) return 0;
			return left.kind === "section" ? -1 : 1;
		});

		for (const item of topLevelItems) {
			if (item.kind === "workspace") {
				result.push(item.workspaceId);
				continue;
			}
			walkSection(item.sectionId, projectWorkspaces, allSections, result);
		}
	}

	return result;
}

type SectionRow = {
	sectionId: string;
	projectId: string | null;
	parentSectionId: string | null;
	tabOrder: number;
};

type WorkspaceRow = {
	workspaceId: string;
	sidebarState: { sectionId: string | null; tabOrder: number };
};

/**
 * Depth-first over one group: nested groups first (folders-first, matching
 * the render), then the group's direct workspaces. A visited set makes
 * corrupt parent cycles terminate instead of recursing forever.
 */
function walkSection(
	sectionId: string,
	scopeWorkspaces: WorkspaceRow[],
	allSections: SectionRow[],
	result: string[],
	visited: Set<string> = new Set(),
): void {
	if (visited.has(sectionId)) return;
	visited.add(sectionId);
	const childSections = allSections
		.filter((section) => section.parentSectionId === sectionId)
		.sort((left, right) => left.tabOrder - right.tabOrder);
	for (const child of childSections) {
		walkSection(child.sectionId, scopeWorkspaces, allSections, result, visited);
	}
	const sectionWorkspaces = scopeWorkspaces
		.filter((workspace) => workspace.sidebarState.sectionId === sectionId)
		.sort(
			(left, right) => left.sidebarState.tabOrder - right.sidebarState.tabOrder,
		);
	for (const workspace of sectionWorkspaces) {
		result.push(workspace.workspaceId);
	}
}
