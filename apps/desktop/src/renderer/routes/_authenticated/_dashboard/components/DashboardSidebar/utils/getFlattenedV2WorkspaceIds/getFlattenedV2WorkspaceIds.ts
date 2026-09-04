import type { AppCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider/collections";
import { getVisibleSidebarWorkspaces } from "renderer/routes/_authenticated/providers/CollectionsProvider/dashboardSidebarLocal";
import {
	deriveTagFolders,
	getProjectFolderTagIndex,
	resolveWorkspaceSectionId,
	type TagFolderContext,
	type TagFolderWorkspaceInput,
} from "renderer/routes/_authenticated/utils/workspaceTagFolders";

type TopLevelItem =
	| { kind: "workspace"; tabOrder: number; workspaceId: string }
	| { kind: "section"; tabOrder: number; sectionId: string };

export function getFlattenedV2WorkspaceIds(
	collections: Pick<
		AppCollections,
		"v2SidebarProjects" | "v2SidebarSections" | "v2WorkspaceLocalState"
	>,
	// Host rows carry the tags that decide folder existence and membership —
	// required so this pass can never fall out of sync with the sidebar
	// builder's resolver (workspaceTagFolders).
	hostWorkspaces: readonly TagFolderWorkspaceInput[],
	tagFolderContext: TagFolderContext,
): string[] {
	// A hidden project keeps its rows but renders nowhere, so its workspaces
	// must not become navigation targets either.
	const projects = Array.from(collections.v2SidebarProjects.state.values())
		.filter((project) => !project.isHidden)
		.sort((left, right) => left.tabOrder - right.tabOrder);
	const allSections = deriveTagFolders(
		Array.from(collections.v2SidebarSections.state.values()),
		hostWorkspaces,
		tagFolderContext,
	);
	const allWorkspaces = Array.from(
		collections.v2WorkspaceLocalState.state.values(),
	);
	const visibleWorkspaces = getVisibleSidebarWorkspaces(allWorkspaces);
	const hostTagsByWorkspaceId = new Map(
		hostWorkspaces.map((workspace) => [workspace.id, workspace.tags]),
	);

	const result: string[] = [];

	// Sessions (null projectId) render in the top-level Sessions section
	// ABOVE the project groups, ordered by tabOrder.
	const sessionWorkspaces = visibleWorkspaces
		.filter((workspace) => workspace.sidebarState.projectId === null)
		.sort(
			(left, right) => left.sidebarState.tabOrder - right.sidebarState.tabOrder,
		);
	for (const workspace of sessionWorkspaces) {
		result.push(workspace.workspaceId);
	}

	for (const project of projects) {
		const projectWorkspaces = visibleWorkspaces.filter(
			(workspace) => workspace.sidebarState.projectId === project.projectId,
		);
		const projectSections = allSections.filter(
			(section) => section.projectId === project.projectId,
		);
		const folderIndex = getProjectFolderTagIndex(
			projectSections,
			project.projectId,
		);
		const effectiveSectionIds = new Map(
			projectWorkspaces.map((workspace) => [
				workspace.workspaceId,
				resolveWorkspaceSectionId({
					tags: hostTagsByWorkspaceId.get(workspace.workspaceId),
					localSectionId: workspace.sidebarState.sectionId,
					index: folderIndex,
				}),
			]),
		);

		const topLevelItems: TopLevelItem[] = [];
		for (const workspace of projectWorkspaces) {
			if (effectiveSectionIds.get(workspace.workspaceId) == null) {
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
					(workspace) =>
						effectiveSectionIds.get(workspace.workspaceId) === item.sectionId,
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
