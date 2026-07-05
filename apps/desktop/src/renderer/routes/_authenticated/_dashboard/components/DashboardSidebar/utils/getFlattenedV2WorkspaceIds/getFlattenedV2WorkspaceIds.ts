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

	for (const project of projects) {
		const projectWorkspaces = visibleWorkspaces.filter(
			(workspace) => workspace.sidebarState.projectId === project.projectId,
		);
		const projectSections = allSections.filter(
			(section) => section.projectId === project.projectId,
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
			const sectionWorkspaces = projectWorkspaces
				.filter(
					(workspace) => workspace.sidebarState.sectionId === item.sectionId,
				)
				.sort(
					(left, right) =>
						left.sidebarState.tabOrder - right.sidebarState.tabOrder,
				);
			for (const workspace of sectionWorkspaces) {
				result.push(workspace.workspaceId);
			}
		}
	}

	return result;
}
