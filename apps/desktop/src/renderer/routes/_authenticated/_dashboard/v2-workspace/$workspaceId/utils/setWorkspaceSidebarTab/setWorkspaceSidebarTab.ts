import type { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import type { WorkspaceSidebarTab } from "renderer/routes/_authenticated/providers/CollectionsProvider/dashboardSidebarLocal/schema";
import { useRowlessSidebarTabStore } from "../../state/rowlessSidebarTabStore";

type Collections = ReturnType<typeof useCollections>;

/** The tab a workspace's sidebar shows before anything has been chosen. */
export const DEFAULT_WORKSPACE_SIDEBAR_TAB: WorkspaceSidebarTab = "changes";

/**
 * Switch a workspace's right-sidebar tab. The sidebar reads its active tab
 * from per-workspace local state (not the global v2 preferences row), so
 * every flow that surfaces a tab's content — a file reveal, opening Changes,
 * the tab strip itself — writes here. An auto-included local `main`
 * workspace has no local row, and creating one would place it explicitly in
 * the sidebar, so its choice goes to the in-memory fallback the sidebar
 * reads whenever the row is missing.
 */
export function setWorkspaceSidebarTab(
	collections: Collections,
	workspaceId: string,
	tab: WorkspaceSidebarTab,
): void {
	if (!collections.v2WorkspaceLocalState.get(workspaceId)) {
		useRowlessSidebarTabStore.getState().setTab(workspaceId, tab);
		return;
	}
	collections.v2WorkspaceLocalState.update(workspaceId, (draft) => {
		draft.sidebarState.activeTab = tab;
	});
}
