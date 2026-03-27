import { createPaneWorkspaceState } from "@superset/pane-layout";
import { useCallback } from "react";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import type { AppCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider/collections";

function getNextTabOrder(items: Array<{ tabOrder: number }>): number {
	const maxTabOrder = items.reduce(
		(maxValue, item) => Math.max(maxValue, item.tabOrder),
		0,
	);
	return maxTabOrder + 1;
}

function ensureSidebarProjectRecord(
	collections: Pick<AppCollections, "v2SidebarProjects">,
	projectId: string,
): void {
	if (collections.v2SidebarProjects.get(projectId)) {
		return;
	}

	collections.v2SidebarProjects.insert({
		projectId,
		createdAt: new Date(),
		tabOrder: getNextTabOrder([
			...collections.v2SidebarProjects.state.values(),
		]),
		isCollapsed: false,
	});
}

function ensureSidebarWorkspaceRecord(
	collections: Pick<
		AppCollections,
		"v2SidebarSections" | "v2WorkspaceLocalState"
	>,
	workspaceId: string,
	projectId: string,
): void {
	if (collections.v2WorkspaceLocalState.get(workspaceId)) {
		return;
	}

	const topLevelOrders = [
		...Array.from(collections.v2WorkspaceLocalState.state.values())
			.filter(
				(item) =>
					item.sidebarState.projectId === projectId &&
					item.sidebarState.sectionId === null,
			)
			.map((item) => ({ tabOrder: item.sidebarState.tabOrder })),
		...Array.from(collections.v2SidebarSections.state.values()).filter(
			(item) => item.projectId === projectId,
		),
	];

	collections.v2WorkspaceLocalState.insert({
		workspaceId,
		createdAt: new Date(),
		sidebarState: {
			projectId,
			tabOrder: getNextTabOrder(topLevelOrders),
			sectionId: null,
		},
		paneLayout: createPaneWorkspaceState({ roots: [] }),
	});
}

export function useDashboardSidebarState() {
	const collections = useCollections();

	const ensureProjectInSidebar = useCallback(
		(projectId: string) => {
			ensureSidebarProjectRecord(collections, projectId);
		},
		[collections],
	);

	const ensureWorkspaceInSidebar = useCallback(
		(workspaceId: string, projectId: string) => {
			ensureSidebarProjectRecord(collections, projectId);
			ensureSidebarWorkspaceRecord(collections, workspaceId, projectId);
		},
		[collections],
	);

	const toggleProjectCollapsed = useCallback(
		(projectId: string) => {
			const existing = collections.v2SidebarProjects.get(projectId);
			if (!existing) return;
			collections.v2SidebarProjects.update(projectId, (draft) => {
				draft.isCollapsed = !draft.isCollapsed;
			});
		},
		[collections],
	);

	const reorderProjects = useCallback(
		(projectIds: string[]) => {
			projectIds.forEach((projectId, index) => {
				if (!collections.v2SidebarProjects.get(projectId)) return;
				collections.v2SidebarProjects.update(projectId, (draft) => {
					draft.tabOrder = index + 1;
				});
			});
		},
		[collections],
	);

	const reorderWorkspaces = useCallback(
		(workspaceIds: string[]) => {
			workspaceIds.forEach((workspaceId, index) => {
				if (!collections.v2WorkspaceLocalState.get(workspaceId)) return;
				collections.v2WorkspaceLocalState.update(workspaceId, (draft) => {
					draft.sidebarState.tabOrder = index + 1;
				});
			});
		},
		[collections],
	);

	const createSection = useCallback(
		(projectId: string, name = "New Section") => {
			ensureSidebarProjectRecord(collections, projectId);

			const sectionId = crypto.randomUUID();
			const sectionOrders = Array.from(
				collections.v2SidebarSections.state.values(),
			).filter((item) => item.projectId === projectId);

			collections.v2SidebarSections.insert({
				sectionId,
				projectId,
				name,
				createdAt: new Date(),
				tabOrder: getNextTabOrder(sectionOrders),
				isCollapsed: false,
				color: null,
			});

			return sectionId;
		},
		[collections],
	);

	const toggleSectionCollapsed = useCallback(
		(sectionId: string) => {
			if (!collections.v2SidebarSections.get(sectionId)) return;
			collections.v2SidebarSections.update(sectionId, (draft) => {
				draft.isCollapsed = !draft.isCollapsed;
			});
		},
		[collections],
	);

	const renameSection = useCallback(
		(sectionId: string, name: string) => {
			if (!collections.v2SidebarSections.get(sectionId)) return;
			collections.v2SidebarSections.update(sectionId, (draft) => {
				draft.name = name.trim();
			});
		},
		[collections],
	);

	const setSectionColor = useCallback(
		(sectionId: string, color: string | null) => {
			if (!collections.v2SidebarSections.get(sectionId)) return;
			collections.v2SidebarSections.update(sectionId, (draft) => {
				draft.color = color;
			});
		},
		[collections],
	);

	const moveWorkspaceToSection = useCallback(
		(workspaceId: string, projectId: string, sectionId: string | null) => {
			const existing = collections.v2WorkspaceLocalState.get(workspaceId);
			if (!existing) return;

			const siblingRows = Array.from(
				collections.v2WorkspaceLocalState.state.values(),
			)
				.filter(
					(item) =>
						item.sidebarState.projectId === projectId &&
						item.workspaceId !== workspaceId &&
						item.sidebarState.sectionId === sectionId,
				)
				.map((item) => ({ tabOrder: item.sidebarState.tabOrder }));

			collections.v2WorkspaceLocalState.update(workspaceId, (draft) => {
				draft.sidebarState.sectionId = sectionId;
				draft.sidebarState.tabOrder = getNextTabOrder(siblingRows);
			});
		},
		[collections],
	);

	const deleteSection = useCallback(
		(sectionId: string) => {
			const section = collections.v2SidebarSections.get(sectionId);
			if (!section) return;

			const siblingTopLevelRows = Array.from(
				collections.v2WorkspaceLocalState.state.values(),
			)
				.filter(
					(item) =>
						item.sidebarState.projectId === section.projectId &&
						item.sidebarState.sectionId === null,
				)
				.map((item) => ({ tabOrder: item.sidebarState.tabOrder }));

			let nextOrder = getNextTabOrder(siblingTopLevelRows);
			for (const workspace of collections.v2WorkspaceLocalState.state.values()) {
				if (workspace.sidebarState.sectionId !== sectionId) continue;
				collections.v2WorkspaceLocalState.update(
					workspace.workspaceId,
					(draft) => {
						draft.sidebarState.sectionId = null;
						draft.sidebarState.tabOrder = nextOrder;
					},
				);
				nextOrder += 1;
			}

			collections.v2SidebarSections.delete(sectionId);
		},
		[collections],
	);

	const removeWorkspaceFromSidebar = useCallback(
		(workspaceId: string) => {
			if (!collections.v2WorkspaceLocalState.get(workspaceId)) return;
			collections.v2WorkspaceLocalState.delete(workspaceId);
		},
		[collections],
	);

	const removeProjectFromSidebar = useCallback(
		(projectId: string) => {
			const workspaceIds = Array.from(
				collections.v2WorkspaceLocalState.state.values(),
			)
				.filter((item) => item.sidebarState.projectId === projectId)
				.map((item) => item.workspaceId);
			const sectionIds = Array.from(
				collections.v2SidebarSections.state.values(),
			)
				.filter((item) => item.projectId === projectId)
				.map((item) => item.sectionId);

			if (workspaceIds.length > 0) {
				collections.v2WorkspaceLocalState.delete(workspaceIds);
			}
			if (sectionIds.length > 0) {
				collections.v2SidebarSections.delete(sectionIds);
			}
			if (collections.v2SidebarProjects.get(projectId)) {
				collections.v2SidebarProjects.delete(projectId);
			}
		},
		[collections],
	);

	return {
		createSection,
		deleteSection,
		ensureProjectInSidebar,
		ensureWorkspaceInSidebar,
		moveWorkspaceToSection,
		removeProjectFromSidebar,
		removeWorkspaceFromSidebar,
		reorderProjects,
		reorderWorkspaces,
		renameSection,
		setSectionColor,
		toggleProjectCollapsed,
		toggleSectionCollapsed,
	};
}
