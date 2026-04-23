interface TabsState {
	activeTabIds?: Record<string, string | null>;
	focusedPaneIds?: Record<string, string>;
}

interface PaneLocation {
	workspaceId: string;
	tabId: string;
	paneId: string;
}

/**
 * Renderer-side mirror of
 * apps/desktop/src/main/lib/notifications/utils.ts#isPaneVisible. Kept as a
 * tiny local copy rather than pulled from `main/` to avoid crossing the
 * renderer/main boundary for a pure data helper.
 */
export function isPaneVisible({
	currentWorkspaceId,
	tabsState,
	pane,
}: {
	currentWorkspaceId: string | null;
	tabsState: TabsState | undefined;
	pane: PaneLocation;
}): boolean {
	if (!currentWorkspaceId || !tabsState) return false;
	const isViewingWorkspace = currentWorkspaceId === pane.workspaceId;
	const isActiveTab =
		tabsState.activeTabIds?.[pane.workspaceId] === pane.tabId;
	const isFocusedPane =
		tabsState.focusedPaneIds?.[pane.tabId] === pane.paneId;
	return isViewingWorkspace && isActiveTab && isFocusedPane;
}
