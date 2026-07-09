import type { SelectV2Workspace } from "@superset/db/schema";
import type { WorkspaceState } from "@superset/panes";
import type { PaneLifecycleRow } from "renderer/routes/_authenticated/components/utils/paneLifecycleRows";
import type { AppCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider/collections";
import {
	getNextTabOrder,
	getPrependTabOrder,
	isSidebarWorkspaceVisible,
} from "renderer/routes/_authenticated/providers/CollectionsProvider/dashboardSidebarLocal";

export type SidebarWorkspaceRow = Pick<
	SelectV2Workspace,
	"id" | "projectId" | "type" | "hostId"
>;

/**
 * Pure sidebar local-state mutations, kept free of React/Electron imports so
 * they can be unit-tested against an in-memory collection. Pane-runtime cleanup
 * is injected so the registry side effects stay in the hook layer.
 */

export function createEmptyPaneLayout(): WorkspaceState<unknown> {
	return {
		version: 1,
		tabs: [],
		activeTabId: null,
	} satisfies WorkspaceState<unknown>;
}

type CleanupPaneRuntimes = (rows: PaneLifecycleRow[]) => void;

/**
 * Hides a single workspace while keeping its project in the sidebar, by leaving
 * a hidden "tombstone" row rather than deleting it. A local `main` workspace
 * with no local-state row is re-surfaced by the gated auto-include path, so
 * hiding one requires a row (`isHidden: true`) to suppress it; a hard-delete
 * would let it reappear.
 */
export function tombstoneSidebarWorkspaceRecord(
	collections: Pick<AppCollections, "v2WorkspaceLocalState">,
	workspaceId: string,
	projectId: string,
	cleanupPaneRuntimes: CleanupPaneRuntimes,
): void {
	const existing = collections.v2WorkspaceLocalState.get(workspaceId);
	if (!existing) {
		collections.v2WorkspaceLocalState.insert({
			workspaceId,
			createdAt: new Date(),
			sidebarState: {
				projectId,
				tabOrder: 0,
				sectionId: null,
				isHidden: true,
			},
			paneLayout: createEmptyPaneLayout(),
		});
		return;
	}

	cleanupPaneRuntimes([existing]);
	collections.v2WorkspaceLocalState.update(workspaceId, (draft) => {
		draft.sidebarState.projectId = projectId;
		draft.sidebarState.sectionId = null;
		draft.sidebarState.isHidden = true;
		draft.paneLayout = createEmptyPaneLayout();
	});
}

/**
 * Removes a project from the sidebar. Deleting its `v2SidebarProjects` row is
 * what hides it: membership is explicit and display gates on it
 * (`buildDashboardSidebarProjects` drops any workspace whose project is absent).
 *
 * Worktrees are tombstoned so "removed" stays removed. A worktree with no
 * local-state row would be re-placed by `usePlaceLocalWorktreesInSidebar`
 * (recreating the project), and a kept-but-visible row would flood back the
 * moment anything recreates the project row — e.g. a later automation-created
 * worktree. Hiding each one (existing rows, plus this device's row-less
 * worktrees the reconciler could re-pin) means a resurrected project shows only
 * the genuinely-new worktree, not these dismissed ones.
 *
 * `main` workspaces are intentionally left alone: they surface via the gated
 * auto-include path (never re-pinned, never create a project record), so
 * deleting the project row already hides them and re-adding the project brings
 * the main back. Removing a project discards `defaultOpenInApp` (stored on the
 * project row and nowhere else); it resets to default on re-add.
 */
export function removeProjectFromSidebarState(
	collections: Pick<
		AppCollections,
		"v2WorkspaceLocalState" | "v2SidebarSections" | "v2SidebarProjects"
	>,
	workspaces: SidebarWorkspaceRow[],
	projectId: string,
	machineId: string,
	cleanupPaneRuntimes: CleanupPaneRuntimes,
): void {
	const mainWorkspaceIds = new Set(
		workspaces
			.filter((ws) => ws.projectId === projectId && ws.type === "main")
			.map((ws) => ws.id),
	);

	const worktreeIds = new Set<string>();
	for (const row of collections.v2WorkspaceLocalState.state.values()) {
		if (
			row.sidebarState.projectId === projectId &&
			!mainWorkspaceIds.has(row.workspaceId)
		) {
			worktreeIds.add(row.workspaceId);
		}
	}
	for (const ws of workspaces) {
		if (
			ws.projectId === projectId &&
			ws.type === "worktree" &&
			ws.hostId === machineId
		) {
			worktreeIds.add(ws.id);
		}
	}

	for (const workspaceId of worktreeIds) {
		tombstoneSidebarWorkspaceRecord(
			collections,
			workspaceId,
			projectId,
			cleanupPaneRuntimes,
		);
	}

	const sectionIds = Array.from(collections.v2SidebarSections.state.values())
		.filter((item) => item.projectId === projectId)
		.map((item) => item.sectionId);
	if (sectionIds.length > 0) {
		collections.v2SidebarSections.delete(sectionIds);
	}

	if (collections.v2SidebarProjects.get(projectId)) {
		collections.v2SidebarProjects.delete(projectId);
	}
}

export type ProjectTopLevelItem = {
	type: "workspace" | "section";
	id: string;
	tabOrder: number;
};

export type ProjectTopLevelCollections = Pick<
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

export function getProjectTopLevelItems(
	collections: ProjectTopLevelCollections,
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

export function ensureSidebarProjectRecord(
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

export function ensureSidebarWorkspaceRecord(
	collections: Pick<
		AppCollections,
		"v2SidebarSections" | "v2WorkspaceLocalState"
	>,
	workspaceId: string,
	projectId: string,
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
