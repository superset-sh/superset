import { useCallback, useEffect, useRef } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useTabsStore } from "renderer/stores/tabs/store";
import {
	registerSlot,
	unregisterSlot,
	webviewGoBack,
	webviewGoForward,
	webviewNavigateTo,
	webviewReload,
} from "renderer/stores/webview-overlay";

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

interface UsePersistentWebviewOptions {
	paneId: string;
}

/**
 * Connects a BrowserPane to the global webview overlay.
 *
 * - Registers a "slot" element so the overlay knows where to position the
 *   webview.
 * - Subscribes to tRPC events (new-window, context-menu) that only matter
 *   while the pane UI is visible.
 * - Exposes navigation helpers that operate on the overlay-managed webview.
 */
export function usePersistentWebview({ paneId }: UsePersistentWebviewOptions) {
	const slotRef = useRef<HTMLDivElement | null>(null);

	const browserState = useTabsStore((s) => s.panes[paneId]?.browser);
	const historyIndex = browserState?.historyIndex ?? 0;
	const historyLength = browserState?.history.length ?? 0;
	const canGoBack = historyIndex > 0;
	const canGoForward = historyIndex < historyLength - 1;

	// Register / unregister the slot element with the overlay manager
	useEffect(() => {
		const el = slotRef.current;
		if (el) registerSlot(paneId, el);
		return () => unregisterSlot(paneId);
	}, [paneId]);

	// Subscribe to new-window events (target="_blank" links, window.open)
	electronTrpc.browser.onNewWindow.useSubscription(
		{ paneId },
		{
			onData: ({ url }: { url: string }) => {
				const state = useTabsStore.getState();
				const pane = state.panes[paneId];
				if (!pane) return;
				const tab = state.tabs.find((t) => t.id === pane.tabId);
				if (!tab) return;
				state.openInBrowserPane(tab.workspaceId, url);
			},
		},
	);

	// Subscribe to context menu actions (e.g. "Open Link as New Split")
	electronTrpc.browser.onContextMenuAction.useSubscription(
		{ paneId },
		{
			onData: ({ action, url }: { action: string; url: string }) => {
				if (action === "open-in-split") {
					const state = useTabsStore.getState();
					const pane = state.panes[paneId];
					if (!pane) return;
					const tab = state.tabs.find((t) => t.id === pane.tabId);
					if (!tab) return;
					state.openInBrowserPane(tab.workspaceId, url);
				}
			},
		},
	);

	// -- Navigation methods ------------------------------------------------

	const goBack = useCallback(() => webviewGoBack(paneId), [paneId]);
	const goForward = useCallback(() => webviewGoForward(paneId), [paneId]);
	const reload = useCallback(() => webviewReload(paneId), [paneId]);
	const navigateTo = useCallback(
		(url: string) => webviewNavigateTo(paneId, url),
		[paneId],
	);

	return {
		slotRef,
		goBack,
		goForward,
		reload,
		navigateTo,
		canGoBack,
		canGoForward,
	};
}
