import type { PaneFocusTarget } from "renderer/stores/pane-focus-intent";

/** The slice of the workspace store this needs; keeps the logic testable. */
export interface FocusIntentStoreState {
	tabs: { id: string; panes: Record<string, unknown> }[];
	setActiveTab: (tabId: string) => void;
	setActivePane: (args: { tabId: string; paneId: string }) => void;
}

/**
 * Apply a pending focus request against one workspace's store.
 *
 * `clear` runs BEFORE the writes: `setActiveTab` notifies store subscribers
 * synchronously, and the caller is one of them, so leaving the request pending
 * re-enters this and recurses until the stack blows.
 *
 * Returns what happened, so callers can be tested without React.
 */
export function applyFocusIntent({
	target,
	workspaceId,
	state,
	isLayoutReady,
	clear,
}: {
	target: PaneFocusTarget | null;
	workspaceId: string;
	state: FocusIntentStoreState;
	isLayoutReady: boolean;
	clear: () => void;
}): "applied" | "retry" | "dropped" | "ignored" {
	if (!target || target.workspaceId !== workspaceId) return "ignored";

	const tab = state.tabs.find((candidate) => candidate.id === target.tabId);
	const pane = tab?.panes[target.paneId];

	if (tab && pane) {
		clear();
		state.setActiveTab(tab.id);
		state.setActivePane({ tabId: tab.id, paneId: target.paneId });
		return "applied";
	}

	// An empty store means the layout is still loading, even when the ready
	// flag is already set — dropping the request there would silently lose a
	// cross-workspace switch. Once loaded and populated, the pane really is
	// gone and the request must not fire later against a different layout.
	if (isLayoutReady && state.tabs.length > 0) {
		clear();
		return "dropped";
	}

	return "retry";
}
