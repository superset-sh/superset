import type { Pane } from "@superset/panes";
import { useCallback } from "react";
import { terminalRuntimeRegistry } from "renderer/lib/terminal/terminal-runtime-registry";
import { browserRuntimeRegistry } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/usePaneRegistry/components/BrowserPane/browserRuntimeRegistry";
import {
	extractPaneIds,
	type PaneLifecycleRow,
} from "renderer/routes/_authenticated/components/utils/paneLifecycleRows";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import type { AppCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider/collections";
import {
	getNextTabOrder,
	getPrependTabOrder,
	isSidebarWorkspaceVisible,
} from "renderer/routes/_authenticated/providers/CollectionsProvider/dashboardSidebarLocal";
import { useHostWorkspaces } from "renderer/routes/_authenticated/providers/HostWorkspacesProvider";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import { PROJECT_CUSTOM_COLORS } from "shared/constants/project-colors";
import {
	createEmptyPaneLayout,
	removeProjectFromSidebarState,
	tombstoneSidebarWorkspaceRecord,
} from "./sidebarMutations";

type ProjectTopLevelItem = {
	type: "workspace" | "section";
	id: string;
	tabOrder: number;
};

type ProjectTopLevelCollections = Pick<
	AppCollections,
	"v2SidebarSections" | "v2WorkspaceLocalState"
>;

function compareProjectTopLevelItems(
	left: ProjectTopLevelItem,
	right: ProjectTopLevelItem,
): number {
	const orderDelta = left.tabOrder - right.tabOrder;
	if (orderDelta !== 0) return orderDelta;
	if (left.type === right.type) return 0;
	return left.type === "section" ? -1 : 1;
}

function getProjectTopLevelItems(
	collections: ProjectTopLevelCollections,
	// Null scopes to the Sessions section (project-less workspaces).
	projectId: string | null,
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

function getFirstSectionIndex(items: ProjectTopLevelItem[]): number {
	const firstSectionIndex = items.findIndex((item) => item.type === "section");
	return firstSectionIndex === -1 ? items.length : firstSectionIndex;
}

/**
 * Rewrites the flat top-level project lane. Workspace items are explicitly
 * ungrouped by setting sidebarState.projectId and clearing sidebarState.sectionId.
 */
function writeProjectTopLevelOrder(
	collections: ProjectTopLevelCollections,
	projectId: string | null,
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
		// Prepend, matching new workspaces: the project you just added is
		// the one you're about to work in.
		tabOrder: getPrependTabOrder([
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
	// Null places the workspace in the Sessions section.
	projectId: string | null,
): void {
	const existing = collections.v2WorkspaceLocalState.get(workspaceId);
	if (existing && isSidebarWorkspaceVisible(existing)) {
		return;
	}

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

function getTerminalRuntimeId(pane: Pane<unknown>): string | null {
	if (pane.kind !== "terminal") return null;
	if (!pane.data || typeof pane.data !== "object") return null;
	const data = pane.data as { terminalId?: unknown };
	return typeof data.terminalId === "string" ? data.terminalId : null;
}

function getBrowserRuntimeId(pane: Pane<unknown>): string | null {
	return pane.kind === "browser" ? pane.id : null;
}

function cleanupWorkspacePaneRuntimes(rows: PaneLifecycleRow[]): void {
	for (const terminalId of extractPaneIds(rows, getTerminalRuntimeId)) {
		terminalRuntimeRegistry.release(terminalId);
	}
	for (const browserId of extractPaneIds(rows, getBrowserRuntimeId)) {
		browserRuntimeRegistry.destroy(browserId);
	}
}

export function useDashboardSidebarState() {
	const collections = useCollections();
	const { workspaces: hostWorkspaces } = useHostWorkspaces();
	const { machineId } = useLocalHostService();

	const ensureProjectInSidebar = useCallback(
		(projectId: string) => {
			ensureSidebarProjectRecord(collections, projectId);
		},
		[collections],
	);

	const ensureWorkspaceInSidebar = useCallback(
		(workspaceId: string, projectId: string | null) => {
			// Sessions (null projectId) have no project placement row — the
			// Sessions section renders unconditionally.
			if (projectId !== null) {
				ensureSidebarProjectRecord(collections, projectId);
			}
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
					draft.sidebarState.isHidden = false;
				});
			});
		},
		[collections],
	);

	const reorderProjectChildren = useCallback(
		(
			projectId: string | null,
			orderedItems: Array<{ type: "workspace" | "section"; id: string }>,
		) => {
			orderedItems.forEach((item, index) => {
				const tabOrder = index + 1;
				if (item.type === "workspace") {
					if (!collections.v2WorkspaceLocalState.get(item.id)) return;
					collections.v2WorkspaceLocalState.update(item.id, (draft) => {
						draft.sidebarState.tabOrder = tabOrder;
						draft.sidebarState.sectionId = null;
						draft.sidebarState.projectId = projectId;
						draft.sidebarState.isHidden = false;
					});
				} else {
					if (!collections.v2SidebarSections.get(item.id)) return;
					collections.v2SidebarSections.update(item.id, (draft) => {
						draft.tabOrder = tabOrder;
					});
				}
			});
		},
		[collections],
	);

	const moveWorkspaceToSectionAtIndex = useCallback(
		(
			workspaceId: string,
			projectId: string | null,
			sectionId: string,
			index: number,
		) => {
			const existing = collections.v2WorkspaceLocalState.get(workspaceId);
			if (!existing) return;
			const siblings = Array.from(
				collections.v2WorkspaceLocalState.state.values(),
			)
				.filter(
					(item) =>
						item.sidebarState.projectId === projectId &&
						isSidebarWorkspaceVisible(item) &&
						item.workspaceId !== workspaceId &&
						item.sidebarState.sectionId === sectionId,
				)
				.sort((a, b) => a.sidebarState.tabOrder - b.sidebarState.tabOrder);
			const reordered = [...siblings];
			reordered.splice(index, 0, existing);
			reordered.forEach((item, i) => {
				collections.v2WorkspaceLocalState.update(item.workspaceId, (draft) => {
					draft.sidebarState.tabOrder = i + 1;
					draft.sidebarState.sectionId = sectionId;
					draft.sidebarState.projectId = projectId;
					draft.sidebarState.isHidden = false;
				});
			});
		},
		[collections],
	);

	const createSection = useCallback(
		(projectId: string, options: { name?: string } = {}) => {
			const { name = "New group" } = options;
			ensureSidebarProjectRecord(collections, projectId);

			const sectionId = crypto.randomUUID();
			const randomColor =
				PROJECT_CUSTOM_COLORS[
					Math.floor(Math.random() * PROJECT_CUSTOM_COLORS.length)
				].value;

			const tabOrder = getNextTabOrder(
				getProjectTopLevelItems(collections, projectId),
			);

			collections.v2SidebarSections.insert({
				sectionId,
				projectId,
				name,
				createdAt: new Date(),
				tabOrder,
				isCollapsed: false,
				color: randomColor,
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
		(
			workspaceId: string,
			projectId: string | null,
			sectionId: string | null,
		) => {
			const existing = collections.v2WorkspaceLocalState.get(workspaceId);
			if (!existing) return;

			if (sectionId === null) {
				const currentSectionId = existing.sidebarState.sectionId;
				const sameProject = existing.sidebarState.projectId === projectId;
				// Already ungrouped in this project — nothing to move.
				if (
					currentSectionId === null &&
					sameProject &&
					isSidebarWorkspaceVisible(existing)
				) {
					return;
				}
				const topLevelItems = getProjectTopLevelItems(collections, projectId, {
					excludeWorkspaceId: workspaceId,
				});
				// Groups interleave with ungrouped rows, so "before the first
				// section" can be far from the row's group. Keep the row in
				// place: land it directly below its former group.
				const sectionIndex = sameProject
					? topLevelItems.findIndex(
							(item) => item.type === "section" && item.id === currentSectionId,
						)
					: -1;
				const insertIndex =
					sectionIndex === -1
						? getFirstSectionIndex(topLevelItems)
						: sectionIndex + 1;
				topLevelItems.splice(insertIndex, 0, {
					type: "workspace",
					id: workspaceId,
					tabOrder: 0,
				});
				writeProjectTopLevelOrder(collections, projectId, topLevelItems);
				return;
			}

			const siblingRows = Array.from(
				collections.v2WorkspaceLocalState.state.values(),
			)
				.filter(
					(item) =>
						item.sidebarState.projectId === projectId &&
						isSidebarWorkspaceVisible(item) &&
						item.workspaceId !== workspaceId &&
						item.sidebarState.sectionId === sectionId,
				)
				.map((item) => ({ tabOrder: item.sidebarState.tabOrder }));

			collections.v2WorkspaceLocalState.update(workspaceId, (draft) => {
				draft.sidebarState.projectId = projectId;
				draft.sidebarState.sectionId = sectionId;
				draft.sidebarState.tabOrder = getNextTabOrder(siblingRows);
				draft.sidebarState.isHidden = false;
			});
		},
		[collections],
	);

	const deleteSection = useCallback(
		(sectionId: string) => {
			const section = collections.v2SidebarSections.get(sectionId);
			if (!section) return;

			// Groups interleave with ungrouped rows, so replace the deleted
			// section's own slot with its members instead of dumping them
			// "before the first section" (which may be far away).
			const withSection = getProjectTopLevelItems(
				collections,
				section.projectId,
			);
			const sectionIndex = withSection.findIndex(
				(item) => item.type === "section" && item.id === sectionId,
			);
			const topLevelItems = withSection.filter(
				(item) => !(item.type === "section" && item.id === sectionId),
			);
			const sectionWorkspaces = Array.from(
				collections.v2WorkspaceLocalState.state.values(),
			)
				.filter(
					(item) =>
						item.sidebarState.projectId === section.projectId &&
						isSidebarWorkspaceVisible(item) &&
						item.sidebarState.sectionId === sectionId,
				)
				.sort(
					(left, right) =>
						left.sidebarState.tabOrder - right.sidebarState.tabOrder,
				);

			const insertIndex =
				sectionIndex === -1
					? getFirstSectionIndex(topLevelItems)
					: sectionIndex;
			topLevelItems.splice(
				insertIndex,
				0,
				...sectionWorkspaces.map((workspace) => ({
					type: "workspace" as const,
					id: workspace.workspaceId,
					tabOrder: 0,
				})),
			);
			writeProjectTopLevelOrder(collections, section.projectId, topLevelItems);

			collections.v2SidebarSections.delete(sectionId);
		},
		[collections],
	);

	const setWorkspacePinned = useCallback(
		(workspaceId: string, projectId: string | null, pinned: boolean) => {
			const existing = collections.v2WorkspaceLocalState.get(workspaceId);
			if (!existing) {
				if (!pinned) return;
				// Auto-included local main workspaces have no local-state row yet;
				// pinning is an explicit placement, so create one first. Sessions
				// (null projectId) have no project placement row.
				if (projectId !== null) {
					ensureSidebarProjectRecord(collections, projectId);
				}
				ensureSidebarWorkspaceRecord(collections, workspaceId, projectId);
			}
			// Strictly greater than every existing pin so same-millisecond pins
			// still order by pin sequence instead of collection iteration order.
			const maxPinnedAt = Array.from(
				collections.v2WorkspaceLocalState.state.values(),
			).reduce((max, row) => Math.max(max, row.sidebarState.pinnedAt ?? 0), 0);
			collections.v2WorkspaceLocalState.update(workspaceId, (draft) => {
				if (pinned) {
					// Keep the original pin time on repeat pins so the row doesn't
					// jump to the bottom of the Pinned section.
					draft.sidebarState.pinnedAt ??= Math.max(Date.now(), maxPinnedAt + 1);
					draft.sidebarState.isHidden = false;
				} else {
					// Only clear the pin — projectId/sectionId/tabOrder stay
					// untouched so the row returns to its previous spot.
					draft.sidebarState.pinnedAt = null;
				}
			});
		},
		[collections],
	);

	const reorderPinnedWorkspaces = useCallback(
		(
			orderedPins: Array<{ workspaceId: string; projectId: string | null }>,
			options: { allowNewWorkspaceId?: string } = {},
		) => {
			// Safety net: a single drop may pin at most ONE new workspace (the
			// dragged one). Anything else not already pinned is dropped here so a
			// corrupted caller list can never mass-pin rows.
			const eligiblePins = orderedPins.filter(
				({ workspaceId }) =>
					workspaceId === options.allowNewWorkspaceId ||
					collections.v2WorkspaceLocalState.get(workspaceId)?.sidebarState
						.pinnedAt != null,
			);
			// Rewrite pinnedAt as a strictly-ascending sequence anchored at the
			// smallest existing pin time, so the sequence stays below Date.now()
			// and future pins (which use max(now, max+1)) still append last.
			const existingPinnedAts = eligiblePins.flatMap(({ workspaceId }) => {
				const pinnedAt =
					collections.v2WorkspaceLocalState.get(workspaceId)?.sidebarState
						.pinnedAt;
				return pinnedAt != null ? [pinnedAt] : [];
			});
			const base =
				existingPinnedAts.length > 0
					? Math.min(...existingPinnedAts)
					: Date.now();
			eligiblePins.forEach(({ workspaceId, projectId }, index) => {
				if (!collections.v2WorkspaceLocalState.get(workspaceId)) {
					if (projectId !== null) {
						ensureSidebarProjectRecord(collections, projectId);
					}
					ensureSidebarWorkspaceRecord(collections, workspaceId, projectId);
				}
				collections.v2WorkspaceLocalState.update(workspaceId, (draft) => {
					draft.sidebarState.pinnedAt = base + index;
					draft.sidebarState.isHidden = false;
				});
			});
		},
		[collections],
	);

	const removeWorkspaceFromSidebar = useCallback(
		(workspaceId: string) => {
			const workspace = collections.v2WorkspaceLocalState.get(workspaceId);
			if (!workspace) return;
			cleanupWorkspacePaneRuntimes([workspace]);
			collections.v2WorkspaceLocalState.delete(workspaceId);
		},
		[collections],
	);

	const hideWorkspaceInSidebar = useCallback(
		(workspaceId: string, projectId: string | null) => {
			tombstoneSidebarWorkspaceRecord(
				collections,
				workspaceId,
				projectId,
				cleanupWorkspacePaneRuntimes,
			);
		},
		[collections],
	);

	const removeProjectFromSidebar = useCallback(
		(projectId: string) => {
			removeProjectFromSidebarState(
				collections,
				hostWorkspaces,
				projectId,
				machineId,
				cleanupWorkspacePaneRuntimes,
			);
		},
		[collections, hostWorkspaces, machineId],
	);

	return {
		createSection,
		deleteSection,
		ensureProjectInSidebar,
		ensureWorkspaceInSidebar,
		hideWorkspaceInSidebar,
		moveWorkspaceToSection,
		moveWorkspaceToSectionAtIndex,
		removeProjectFromSidebar,
		reorderPinnedWorkspaces,
		reorderProjectChildren,
		removeWorkspaceFromSidebar,
		reorderProjects,
		reorderWorkspaces,
		renameSection,
		setSectionColor,
		setWorkspacePinned,
		toggleProjectCollapsed,
		toggleSectionCollapsed,
	};
}
