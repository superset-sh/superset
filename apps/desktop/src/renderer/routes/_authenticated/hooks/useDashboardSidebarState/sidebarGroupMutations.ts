import type { AppCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider/collections";
import {
	getNextTabOrder,
	getPrependTabOrder,
	isSidebarWorkspaceVisible,
} from "renderer/routes/_authenticated/providers/CollectionsProvider/dashboardSidebarLocal";
import { PROJECT_CUSTOM_COLORS } from "shared/constants/project-colors";
import { createEmptyPaneLayout } from "./sidebarMutations";

type SidebarGroupCollections = Pick<
	AppCollections,
	"v2SidebarProjects" | "v2SidebarSections" | "v2WorkspaceLocalState"
>;

export type ProjectTopLevelItem = {
	type: "workspace" | "section";
	id: string;
	tabOrder: number;
};

function compareProjectTopLevelItems(
	left: ProjectTopLevelItem,
	right: ProjectTopLevelItem,
): number {
	const orderDelta = left.tabOrder - right.tabOrder;
	if (orderDelta !== 0) return orderDelta;
	if (left.type === right.type) return 0;
	return left.type === "section" ? -1 : 1;
}

export function getProjectTopLevelItems(
	collections: Pick<
		SidebarGroupCollections,
		"v2SidebarSections" | "v2WorkspaceLocalState"
	>,
	projectId: string,
	options: { excludeWorkspaceId?: string; excludeSectionId?: string } = {},
): ProjectTopLevelItem[] {
	return [
		...Array.from(collections.v2WorkspaceLocalState.state.values())
			.filter(
				(item) =>
					item.sidebarState.projectId === projectId &&
					isSidebarWorkspaceVisible(item) &&
					item.sidebarState.sectionId === null &&
					item.workspaceId !== options.excludeWorkspaceId,
			)
			.map((item) => ({
				type: "workspace" as const,
				id: item.workspaceId,
				tabOrder: item.sidebarState.tabOrder,
			})),
		...Array.from(collections.v2SidebarSections.state.values())
			.filter(
				(item) =>
					item.projectId === projectId &&
					item.sectionId !== options.excludeSectionId,
			)
			.map((item) => ({
				type: "section" as const,
				id: item.sectionId,
				tabOrder: item.tabOrder,
			})),
	].sort(compareProjectTopLevelItems);
}

export function getFirstSectionIndex(items: ProjectTopLevelItem[]): number {
	const firstSectionIndex = items.findIndex((item) => item.type === "section");
	return firstSectionIndex === -1 ? items.length : firstSectionIndex;
}

export function writeProjectTopLevelOrder(
	collections: Pick<
		SidebarGroupCollections,
		"v2SidebarSections" | "v2WorkspaceLocalState"
	>,
	projectId: string,
	items: ProjectTopLevelItem[],
): void {
	items.forEach((item, index) => {
		const tabOrder = index + 1;
		if (item.type === "workspace") {
			if (!collections.v2WorkspaceLocalState.get(item.id)) return;
			collections.v2WorkspaceLocalState.update(item.id, (draft) => {
				draft.sidebarState.projectId = projectId;
				draft.sidebarState.sectionId = null;
				draft.sidebarState.tabOrder = tabOrder;
				draft.sidebarState.isHidden = false;
			});
			return;
		}

		if (!collections.v2SidebarSections.get(item.id)) return;
		collections.v2SidebarSections.update(item.id, (draft) => {
			draft.tabOrder = tabOrder;
		});
	});
}

export function ensureSidebarProjectRecord(
	collections: Pick<SidebarGroupCollections, "v2SidebarProjects">,
	projectId: string,
): void {
	if (collections.v2SidebarProjects.get(projectId)) return;
	collections.v2SidebarProjects.insert({
		projectId,
		createdAt: new Date(),
		tabOrder: getNextTabOrder([
			...collections.v2SidebarProjects.state.values(),
		]),
		isCollapsed: false,
	});
}

export function ensureSidebarWorkspaceRecord(
	collections: Pick<
		SidebarGroupCollections,
		"v2SidebarSections" | "v2WorkspaceLocalState"
	>,
	workspaceId: string,
	projectId: string,
): void {
	const existing = collections.v2WorkspaceLocalState.get(workspaceId);
	if (existing && isSidebarWorkspaceVisible(existing)) return;

	const topLevelItems = getProjectTopLevelItems(collections, projectId);
	if (existing) {
		collections.v2WorkspaceLocalState.update(workspaceId, (draft) => {
			draft.sidebarState.projectId = projectId;
			draft.sidebarState.tabOrder = getPrependTabOrder(topLevelItems);
			draft.sidebarState.sectionId = null;
			draft.sidebarState.isHidden = false;
		});
		return;
	}

	collections.v2WorkspaceLocalState.insert({
		workspaceId,
		createdAt: new Date(),
		sidebarState: {
			projectId,
			tabOrder: getPrependTabOrder(topLevelItems),
			sectionId: null,
			isHidden: false,
		},
		paneLayout: createEmptyPaneLayout(),
	});
}

export function createSidebarGroup(
	collections: SidebarGroupCollections,
	input: { groupId: string; projectId: string; name: string },
): string {
	const name = input.name.trim();
	const existing = collections.v2SidebarSections.get(input.groupId);
	if (existing) {
		if (existing.projectId === input.projectId && existing.name === name) {
			return existing.sectionId;
		}
		throw new Error(`Group already exists: ${input.groupId}`);
	}

	ensureSidebarProjectRecord(collections, input.projectId);
	const randomColor =
		PROJECT_CUSTOM_COLORS[
			Math.floor(Math.random() * PROJECT_CUSTOM_COLORS.length)
		].value;
	collections.v2SidebarSections.insert({
		sectionId: input.groupId,
		projectId: input.projectId,
		name,
		createdAt: new Date(),
		tabOrder: getNextTabOrder(
			getProjectTopLevelItems(collections, input.projectId),
		),
		isCollapsed: false,
		color: randomColor,
	});
	return input.groupId;
}

export function renameSidebarGroup(
	collections: SidebarGroupCollections,
	groupId: string,
	name: string,
): void {
	if (!collections.v2SidebarSections.get(groupId)) {
		throw new Error(`Group not found: ${groupId}`);
	}
	collections.v2SidebarSections.update(groupId, (draft) => {
		draft.name = name.trim();
	});
}

export function setSidebarGroupCollapsed(
	collections: SidebarGroupCollections,
	groupId: string,
	collapsed: boolean,
): void {
	if (!collections.v2SidebarSections.get(groupId)) {
		throw new Error(`Group not found: ${groupId}`);
	}
	collections.v2SidebarSections.update(groupId, (draft) => {
		draft.isCollapsed = collapsed;
	});
}

export function moveSidebarWorkspaceToGroup(
	collections: SidebarGroupCollections,
	workspaceId: string,
	groupId: string | null,
): void {
	const workspace = collections.v2WorkspaceLocalState.get(workspaceId);
	if (!workspace || !isSidebarWorkspaceVisible(workspace)) {
		throw new Error(`Workspace is not visible in the sidebar: ${workspaceId}`);
	}
	const projectId = workspace.sidebarState.projectId;
	if (groupId === null) {
		const topLevelItems = getProjectTopLevelItems(collections, projectId, {
			excludeWorkspaceId: workspaceId,
		});
		topLevelItems.splice(getFirstSectionIndex(topLevelItems), 0, {
			type: "workspace",
			id: workspaceId,
			tabOrder: 0,
		});
		writeProjectTopLevelOrder(collections, projectId, topLevelItems);
		return;
	}

	const group = collections.v2SidebarSections.get(groupId);
	if (!group) throw new Error(`Group not found: ${groupId}`);
	if (group.projectId !== projectId) {
		throw new Error("A workspace and group must belong to the same project");
	}
	const siblings = Array.from(
		collections.v2WorkspaceLocalState.state.values(),
	).filter(
		(item) =>
			item.sidebarState.projectId === projectId &&
			isSidebarWorkspaceVisible(item) &&
			item.workspaceId !== workspaceId &&
			item.sidebarState.sectionId === groupId,
	);
	collections.v2WorkspaceLocalState.update(workspaceId, (draft) => {
		draft.sidebarState.projectId = projectId;
		draft.sidebarState.sectionId = groupId;
		draft.sidebarState.tabOrder = getNextTabOrder(
			siblings.map((item) => ({ tabOrder: item.sidebarState.tabOrder })),
		);
		draft.sidebarState.isHidden = false;
	});
}

export function deleteSidebarGroup(
	collections: SidebarGroupCollections,
	groupId: string,
): void {
	const group = collections.v2SidebarSections.get(groupId);
	if (!group) throw new Error(`Group not found: ${groupId}`);
	const topLevelItems = getProjectTopLevelItems(collections, group.projectId, {
		excludeSectionId: groupId,
	});
	const groupWorkspaces = Array.from(
		collections.v2WorkspaceLocalState.state.values(),
	)
		.filter(
			(item) =>
				item.sidebarState.projectId === group.projectId &&
				isSidebarWorkspaceVisible(item) &&
				item.sidebarState.sectionId === groupId,
		)
		.sort(
			(left, right) => left.sidebarState.tabOrder - right.sidebarState.tabOrder,
		);
	topLevelItems.splice(
		getFirstSectionIndex(topLevelItems),
		0,
		...groupWorkspaces.map((workspace) => ({
			type: "workspace" as const,
			id: workspace.workspaceId,
			tabOrder: 0,
		})),
	);
	writeProjectTopLevelOrder(collections, group.projectId, topLevelItems);
	collections.v2SidebarSections.delete(groupId);
}
