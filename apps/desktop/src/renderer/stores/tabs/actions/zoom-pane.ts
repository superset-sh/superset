import type { TabsState } from "../types";

/**
 * Replace `tabs[tabId].layout` with the single leaf `paneId` and stash the
 * original multi-leaf tree in `tabs[tabId].zoom.savedLayout`. No-op if the
 * tab is already zoomed, the tab does not exist, or the tab has only one
 * pane (a string-leaf layout — no siblings to hide).
 */
export function zoomPane(
	state: TabsState,
	tabId: string,
	paneId: string,
): TabsState {
	const tab = state.tabs.find((t) => t.id === tabId);
	if (!tab) return state;
	if (tab.zoom !== undefined) return state;
	if (typeof tab.layout === "string") return state;

	return {
		...state,
		tabs: state.tabs.map((t) =>
			t.id === tabId
				? { ...t, layout: paneId, zoom: { savedLayout: t.layout, paneId } }
				: t,
		),
	};
}

/**
 * Restore `tabs[tabId].layout` from `zoom.savedLayout` and clear `zoom`.
 * No-op if the tab is not zoomed or does not exist.
 */
export function unzoomPane(state: TabsState, tabId: string): TabsState {
	const tab = state.tabs.find((t) => t.id === tabId);
	if (!tab || tab.zoom === undefined) return state;
	const savedLayout = tab.zoom.savedLayout;

	return {
		...state,
		tabs: state.tabs.map((t) =>
			t.id === tabId ? { ...t, layout: savedLayout, zoom: undefined } : t,
		),
	};
}

/**
 * Idempotent: restore the saved layout if zoomed, otherwise no-op. Called as
 * the unconditional first line of `updateTabLayout` and inlined at the start
 * of every leaf layout-mutating action, so any write to `tabs[T].layout`
 * automatically un-zooms before the mutation lands on the tree.
 */
export function clearZoomBeforeMutation(
	state: TabsState,
	tabId: string,
): TabsState {
	return unzoomPane(state, tabId);
}

/**
 * Toggle: zoom if not zoomed, unzoom if zoomed. The `paneId` argument is
 * intentionally only used on the zoom branch — when un-zooming, the saved
 * layout is restored regardless of which pane the toggle was triggered from
 * (only one pane can be zoomed per tab).
 */
export function toggleZoomPane(
	state: TabsState,
	tabId: string,
	paneId: string,
): TabsState {
	const tab = state.tabs.find((t) => t.id === tabId);
	if (!tab) return state;
	return tab.zoom === undefined
		? zoomPane(state, tabId, paneId)
		: unzoomPane(state, tabId);
}
