import type { TabsState } from "./types";

/**
 * Apply zoom-related rules during persist rehydration. Two steps in this order:
 *
 *   1. Restore-if-zoomed: if `tab.zoom` is set AND `tab.layout === tab.zoom.paneId`
 *      (the only legitimate way `layout` can equal `zoom.paneId` is if the tab
 *      was zoomed at quit time, because `zoom.paneId` is set atomically with the
 *      single-leaf overwrite of `layout` in `zoomPane`), write `tab.layout = tab.zoom.savedLayout`.
 *
 *   2. Then clear `zoom`: set `tab.zoom = undefined` on every tab.
 *
 * If the order were reversed, step 1 would always be a no-op (because `zoom`
 * would already be undefined), and tabs that quit while zoomed would rehydrate
 * with the single-leaf zoom tree as their permanent layout — exactly the bug
 * we are preventing.
 *
 * Pre-PR persisted state without a `zoom` field is unaffected: step 1's
 * `zoom !== undefined` check fails harmlessly; step 2 is a no-op (assigning
 * `undefined` to an already-undefined field).
 */
export function applyZoomMergeRules(state: TabsState): TabsState {
	return {
		...state,
		tabs: state.tabs.map((tab) => {
			let layout = tab.layout;
			// Step 1: restore-if-zoomed.
			if (tab.zoom !== undefined && tab.layout === tab.zoom.paneId) {
				layout = tab.zoom.savedLayout;
			}
			// Step 2: clear zoom.
			return { ...tab, layout, zoom: undefined };
		}),
	};
}
