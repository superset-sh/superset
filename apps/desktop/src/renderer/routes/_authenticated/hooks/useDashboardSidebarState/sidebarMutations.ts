import type { WorkspaceState } from "@superset/panes";
import type { PaneLifecycleRow } from "renderer/routes/_authenticated/components/utils/paneLifecycleRows";
import type { AppCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider/collections";

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
 * Removes a project from the sidebar by deleting the one fact that makes it
 * visible: its `v2SidebarProjects` row. Membership is explicit, and display
 * gates on it — `buildDashboardSidebarProjects` drops any workspace whose
 * project is absent, and a local `main` only surfaces under a project in the
 * sidebar — so deleting this row hides the project and everything under it.
 *
 * The project's workspace local-state rows are kept (only their live pane
 * runtimes are torn down): a missing row reads as "never placed" to
 * `usePlaceLocalWorktreesInSidebar`, which would re-add the worktree and
 * recreate the project. Keeping them also lets re-adding the project restore
 * its workspaces and sections. This discards `defaultOpenInApp` (stored on the
 * project row and nowhere else); it resets to default on re-add.
 */
export function removeProjectFromSidebarState(
	collections: Pick<
		AppCollections,
		"v2WorkspaceLocalState" | "v2SidebarProjects"
	>,
	projectId: string,
	cleanupPaneRuntimes: CleanupPaneRuntimes,
): void {
	const workspaceRows = Array.from(
		collections.v2WorkspaceLocalState.state.values(),
	).filter((row) => row.sidebarState.projectId === projectId);
	if (workspaceRows.length > 0) {
		cleanupPaneRuntimes(workspaceRows);
	}

	if (collections.v2SidebarProjects.get(projectId)) {
		collections.v2SidebarProjects.delete(projectId);
	}
}
