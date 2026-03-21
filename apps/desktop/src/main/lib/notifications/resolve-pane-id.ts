import { appState } from "../app-state";
import type { TabsState } from "../app-state/schemas";

/**
 * Resolves paneId from tabId or workspaceId using synced tabs state.
 * Falls back to focused pane in active tab.
 *
 * If a paneId is provided, we trust it and let the renderer validate it
 * against its live in-memory tabs store. This avoids dropping early hook
 * events when the main-process appState is briefly behind the renderer due
 * to debounced persistence.
 */
export function resolvePaneIdFromTabsState(
	tabsState: TabsState | undefined,
	paneId: string | undefined,
	tabId: string | undefined,
	workspaceId: string | undefined,
	sessionId: string | undefined,
): string | undefined {
	if (paneId) {
		return paneId;
	}

	if (!tabsState) return undefined;

	if (tabId) {
		const focusedPaneId = tabsState.focusedPaneIds?.[tabId];
		if (focusedPaneId && tabsState.panes?.[focusedPaneId]) {
			return focusedPaneId;
		}
	}

	if (workspaceId) {
		const activeTabId = tabsState.activeTabIds?.[workspaceId];
		if (activeTabId) {
			const focusedPaneId = tabsState.focusedPaneIds?.[activeTabId];
			if (focusedPaneId && tabsState.panes?.[focusedPaneId]) {
				return focusedPaneId;
			}
		}
	}

	if (sessionId) {
		for (const [existingPaneId, pane] of Object.entries(
			tabsState.panes ?? {},
		)) {
			if (pane.chat?.sessionId === sessionId) {
				return existingPaneId;
			}
		}
	}

	return undefined;
}

/**
 * Resolves pane IDs using main-process persisted tabs state when possible.
 * Explicit pane IDs are trusted to avoid dropping early hook events while
 * tabsState persistence is still catching up.
 */
export function resolvePaneId(
	paneId: string | undefined,
	tabId: string | undefined,
	workspaceId: string | undefined,
	sessionId: string | undefined,
): string | undefined {
	if (paneId) {
		return paneId;
	}

	try {
		return resolvePaneIdFromTabsState(
			appState.data.tabsState,
			undefined,
			tabId,
			workspaceId,
			sessionId,
		);
	} catch {
		// App state not initialized yet, ignore
	}

	return undefined;
}
