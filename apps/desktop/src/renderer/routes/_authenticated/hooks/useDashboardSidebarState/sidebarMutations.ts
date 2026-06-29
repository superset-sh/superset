import type { WorkspaceState } from "@superset/panes";
import type { PaneLifecycleRow } from "renderer/routes/_authenticated/components/utils/paneLifecycleRows";
import type { AppCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider/collections";
import {
	getPrependTabOrder,
	isSidebarWorkspaceVisible,
} from "renderer/routes/_authenticated/providers/CollectionsProvider/dashboardSidebarLocal";

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
 * Moves a workspace into a sidebar section, placing it at the TOP of the group.
 *
 * A workspace you're moving into a group is almost always one you're actively
 * working on, so it should stay immediately visible. Appending to the bottom
 * buries it (often below the fold in a large group), forcing the user to scroll
 * to find the thing they just touched. Prepending matches the
 * "most-recently-acted-on stays on top" mental model (#5342).
 */
export function moveWorkspaceIntoSection(
	collections: Pick<AppCollections, "v2WorkspaceLocalState">,
	workspaceId: string,
	projectId: string,
	sectionId: string,
): void {
	const existing = collections.v2WorkspaceLocalState.get(workspaceId);
	if (!existing) return;

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
		draft.sidebarState.tabOrder = getPrependTabOrder(siblingRows);
		draft.sidebarState.isHidden = false;
	});
}

/**
 * Removes a workspace from the sidebar without deleting its local-state row.
 * Instead of hard-deleting, we leave a hidden "tombstone" row so
 * `useAutoAddLocalWorkspacesToSidebar` (which treats a missing row as "never
 * seen here") doesn't immediately re-pin a workspace the user dismissed.
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
 * Removes a whole project from the sidebar. Workspaces are tombstoned rather
 * than hard-deleted so the auto-add hook doesn't immediately re-pin them (and,
 * via `ensureWorkspaceInSidebar`, recreate the project record). The union below
 * covers both explicitly-placed workspaces and this machine's workspaces that
 * have no local-state row yet (auto-included main/CLI workspaces).
 *
 * `machineId` is required (not nullable): `LocalHostServiceProvider` doesn't
 * render the authenticated tree until it resolves, so any caller has a real id.
 * Keeping it non-null guarantees the `hostId === machineId` filter below can't
 * silently skip row-less workspaces (which would let the auto-add hook re-pin
 * them once an id arrived).
 */
export function removeProjectFromSidebarState(
	collections: Pick<
		AppCollections,
		| "v2WorkspaceLocalState"
		| "v2Workspaces"
		| "v2SidebarSections"
		| "v2SidebarProjects"
	>,
	projectId: string,
	machineId: string,
	cleanupPaneRuntimes: CleanupPaneRuntimes,
): void {
	const workspaceIds = new Set<string>();
	for (const row of collections.v2WorkspaceLocalState.state.values()) {
		if (row.sidebarState.projectId === projectId) {
			workspaceIds.add(row.workspaceId);
		}
	}
	for (const workspace of collections.v2Workspaces.state.values()) {
		if (workspace.projectId === projectId && workspace.hostId === machineId) {
			workspaceIds.add(workspace.id);
		}
	}

	for (const workspaceId of workspaceIds) {
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
