import type { SidebarStateSnapshot } from "@superset/client-state";
import { createEmptyPaneLayout } from "renderer/routes/_authenticated/hooks/useDashboardSidebarState/sidebarMutations";
import type { AppCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider/collections";

type SidebarCollections = Pick<
	AppCollections,
	"v2SidebarProjects" | "v2SidebarSections" | "v2WorkspaceLocalState"
>;

export function applySidebarStateSnapshot(
	collections: SidebarCollections,
	state: SidebarStateSnapshot,
): void {
	const projectIds = new Set(state.projects.map((project) => project.id));
	for (const existing of collections.v2SidebarProjects.state.values()) {
		if (!projectIds.has(existing.projectId)) {
			collections.v2SidebarProjects.delete(existing.projectId);
		}
	}
	for (const project of state.projects) {
		const existing = collections.v2SidebarProjects.get(project.id);
		if (existing) {
			collections.v2SidebarProjects.update(project.id, (draft) => {
				draft.tabOrder = project.tabOrder;
				draft.isCollapsed = project.isCollapsed;
			});
		} else {
			collections.v2SidebarProjects.insert({
				projectId: project.id,
				createdAt: new Date(),
				tabOrder: project.tabOrder,
				isCollapsed: project.isCollapsed,
			});
		}
	}

	const groupIds = new Set(state.groups.map((group) => group.id));
	for (const existing of collections.v2SidebarSections.state.values()) {
		if (!groupIds.has(existing.sectionId)) {
			collections.v2SidebarSections.delete(existing.sectionId);
		}
	}
	for (const group of state.groups) {
		const existing = collections.v2SidebarSections.get(group.id);
		if (existing) {
			collections.v2SidebarSections.update(group.id, (draft) => {
				draft.projectId = group.projectId;
				draft.name = group.name;
				draft.tabOrder = group.tabOrder;
				draft.isCollapsed = group.isCollapsed;
				draft.color = group.color;
			});
		} else {
			collections.v2SidebarSections.insert({
				sectionId: group.id,
				projectId: group.projectId,
				name: group.name,
				createdAt: new Date(),
				tabOrder: group.tabOrder,
				isCollapsed: group.isCollapsed,
				color: group.color,
			});
		}
	}

	const workspaceIds = new Set(
		state.workspaces.map((workspace) => workspace.id),
	);
	for (const existing of collections.v2WorkspaceLocalState.state.values()) {
		if (!workspaceIds.has(existing.workspaceId)) {
			collections.v2WorkspaceLocalState.delete(existing.workspaceId);
		}
	}
	for (const workspace of state.workspaces) {
		const existing = collections.v2WorkspaceLocalState.get(workspace.id);
		if (existing) {
			collections.v2WorkspaceLocalState.update(workspace.id, (draft) => {
				draft.sidebarState.projectId = workspace.projectId;
				draft.sidebarState.sectionId = workspace.groupId;
				draft.sidebarState.tabOrder = workspace.tabOrder;
				draft.sidebarState.isHidden = workspace.isHidden;
			});
		} else {
			collections.v2WorkspaceLocalState.insert({
				workspaceId: workspace.id,
				createdAt: new Date(),
				sidebarState: {
					projectId: workspace.projectId,
					sectionId: workspace.groupId,
					tabOrder: workspace.tabOrder,
					isHidden: workspace.isHidden,
				},
				paneLayout: createEmptyPaneLayout(),
			});
		}
	}
}

export function getSidebarStateSnapshot(
	collections: SidebarCollections,
): SidebarStateSnapshot {
	return {
		projects: Array.from(collections.v2SidebarProjects.state.values())
			.map((project) => ({
				id: project.projectId,
				tabOrder: project.tabOrder,
				isCollapsed: project.isCollapsed,
			}))
			.sort(
				(left, right) =>
					left.tabOrder - right.tabOrder || left.id.localeCompare(right.id),
			),
		groups: Array.from(collections.v2SidebarSections.state.values())
			.map((group) => ({
				id: group.sectionId,
				projectId: group.projectId,
				name: group.name,
				tabOrder: group.tabOrder,
				isCollapsed: group.isCollapsed,
				color: group.color,
			}))
			.sort(
				(left, right) =>
					left.projectId.localeCompare(right.projectId) ||
					left.tabOrder - right.tabOrder ||
					left.id.localeCompare(right.id),
			),
		workspaces: Array.from(collections.v2WorkspaceLocalState.state.values())
			.map((workspace) => ({
				id: workspace.workspaceId,
				projectId: workspace.sidebarState.projectId,
				groupId: workspace.sidebarState.sectionId,
				tabOrder: workspace.sidebarState.tabOrder,
				isHidden: workspace.sidebarState.isHidden,
			}))
			.sort(
				(left, right) =>
					left.projectId.localeCompare(right.projectId) ||
					(left.groupId ?? "").localeCompare(right.groupId ?? "") ||
					left.tabOrder - right.tabOrder ||
					left.id.localeCompare(right.id),
			),
	};
}
