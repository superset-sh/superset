import type { Pane, PaneStatus } from "shared/tabs-types";

interface State {
	panes: Record<string, Pane>;
	activeTabIds: Record<string, string | null>;
	focusedPaneIds: Record<string, string>;
}

/**
 * Decide the post-Stop pane status.
 *
 * "idle" only when the user is actively viewing the pane (the completion is
 * already on screen, so a "review" indicator would be redundant). Otherwise
 * "review", so the sidebar shows a green dot until the user acknowledges.
 *
 * A Stop from "permission" is always treated as acknowledged — the user was
 * already engaged with that pane to reach the permission state.
 */
export function resolveStopPaneStatus(
	state: State,
	workspaceId: string,
	paneId: string,
	currentWorkspaceId: string | null,
): PaneStatus {
	const pane = state.panes[paneId];
	if (pane?.status === "permission") return "idle";

	const tabId = pane?.tabId;
	const activeTabId = state.activeTabIds[workspaceId];
	const isTabActive = tabId != null && tabId === activeTabId;
	const isPaneFocused = tabId != null && state.focusedPaneIds[tabId] === paneId;
	const isOnWorkspace = currentWorkspaceId === workspaceId;

	// focusedPaneIds persists across navigation (it's the last focused pane
	// in the tab), so it cannot on its own prove the user is currently
	// viewing the pane. All three must hold.
	const isUserViewingPane = isOnWorkspace && isTabActive && isPaneFocused;

	return isUserViewingPane ? "idle" : "review";
}

/**
 * Extract the workspace ID from the app's hash route. Supports both
 * `/workspace/<id>` and `/v2-workspace/<id>`. Returns null when off-route.
 */
export function parseWorkspaceIdFromHash(hash: string): string | null {
	const match = hash.match(/\/(?:v2-)?workspace\/([^/?#]+)/);
	return match ? match[1] : null;
}
