import type { WorkspaceStore } from "@superset/panes";
import { useCallback } from "react";
import { useHotkey } from "renderer/hotkeys";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import type { StoreApi } from "zustand";
import type {
	BrowserPaneData,
	ChatPaneData,
	PaneViewerData,
	TerminalPaneData,
} from "../../types";

export function useWorkspaceHotkeys({
	store,
	workspaceId,
}: {
	store: StoreApi<WorkspaceStore<PaneViewerData>>;
	workspaceId: string;
}) {
	const collections = useCollections();

	useHotkey("TOGGLE_SIDEBAR", () => {
		if (!collections.v2WorkspaceLocalState.get(workspaceId)) return;
		collections.v2WorkspaceLocalState.update(workspaceId, (draft) => {
			draft.rightSidebarOpen = !draft.rightSidebarOpen;
		});
	});

	// --- Tab creation ---

	useHotkey("NEW_GROUP", () => {
		store.getState().addTab({
			titleOverride: "Terminal",
			panes: [
				{
					kind: "terminal",
					data: { terminalId: crypto.randomUUID() } as TerminalPaneData,
				},
			],
		});
	});

	useHotkey("NEW_CHAT", () => {
		store.getState().addTab({
			titleOverride: "Chat",
			panes: [{ kind: "chat", data: { sessionId: null } as ChatPaneData }],
		});
	});

	useHotkey("NEW_BROWSER", () => {
		store.getState().addTab({
			titleOverride: "Browser",
			panes: [
				{
					kind: "browser",
					data: {
						url: "http://localhost:3000",
						mode: "preview",
					} as BrowserPaneData,
				},
			],
		});
	});

	// --- Tab management ---

	useHotkey("CLOSE_TERMINAL", () => {
		const state = store.getState();
		const active = state.getActivePane();
		if (active) {
			state.closePane({ tabId: active.tabId, paneId: active.pane.id });
		}
	});

	useHotkey("CLOSE_TAB", () => {
		const state = store.getState();
		if (state.activeTabId) {
			state.removeTab(state.activeTabId);
		}
	});

	useHotkey("PREV_TAB", () => {
		const state = store.getState();
		if (!state.activeTabId || state.tabs.length === 0) return;
		const index = state.tabs.findIndex((t) => t.id === state.activeTabId);
		const prevIndex = index <= 0 ? state.tabs.length - 1 : index - 1;
		state.setActiveTab(state.tabs[prevIndex].id);
	});

	useHotkey("NEXT_TAB", () => {
		const state = store.getState();
		if (!state.activeTabId || state.tabs.length === 0) return;
		const index = state.tabs.findIndex((t) => t.id === state.activeTabId);
		const nextIndex =
			index >= state.tabs.length - 1 || index === -1 ? 0 : index + 1;
		state.setActiveTab(state.tabs[nextIndex].id);
	});

	useHotkey("PREV_TAB_ALT", () => {
		const state = store.getState();
		if (!state.activeTabId || state.tabs.length === 0) return;
		const index = state.tabs.findIndex((t) => t.id === state.activeTabId);
		const prevIndex = index <= 0 ? state.tabs.length - 1 : index - 1;
		state.setActiveTab(state.tabs[prevIndex].id);
	});

	useHotkey("NEXT_TAB_ALT", () => {
		const state = store.getState();
		if (!state.activeTabId || state.tabs.length === 0) return;
		const index = state.tabs.findIndex((t) => t.id === state.activeTabId);
		const nextIndex =
			index >= state.tabs.length - 1 || index === -1 ? 0 : index + 1;
		state.setActiveTab(state.tabs[nextIndex].id);
	});

	const switchToTab = useCallback(
		(index: number) => {
			const state = store.getState();
			const tab = state.tabs[index];
			if (tab) state.setActiveTab(tab.id);
		},
		[store],
	);

	useHotkey("JUMP_TO_TAB_1", () => switchToTab(0));
	useHotkey("JUMP_TO_TAB_2", () => switchToTab(1));
	useHotkey("JUMP_TO_TAB_3", () => switchToTab(2));
	useHotkey("JUMP_TO_TAB_4", () => switchToTab(3));
	useHotkey("JUMP_TO_TAB_5", () => switchToTab(4));
	useHotkey("JUMP_TO_TAB_6", () => switchToTab(5));
	useHotkey("JUMP_TO_TAB_7", () => switchToTab(6));
	useHotkey("JUMP_TO_TAB_8", () => switchToTab(7));
	useHotkey("JUMP_TO_TAB_9", () => switchToTab(8));

	// --- Pane management ---

	useHotkey("PREV_PANE", () => {
		const state = store.getState();
		const tab = state.getActiveTab();
		if (!tab || !tab.activePaneId) return;
		const paneIds = Object.keys(tab.panes);
		const index = paneIds.indexOf(tab.activePaneId);
		const prevIndex = index <= 0 ? paneIds.length - 1 : index - 1;
		state.setActivePane({ tabId: tab.id, paneId: paneIds[prevIndex] });
	});

	useHotkey("NEXT_PANE", () => {
		const state = store.getState();
		const tab = state.getActiveTab();
		if (!tab || !tab.activePaneId) return;
		const paneIds = Object.keys(tab.panes);
		const index = paneIds.indexOf(tab.activePaneId);
		const nextIndex = index >= paneIds.length - 1 ? 0 : index + 1;
		state.setActivePane({ tabId: tab.id, paneId: paneIds[nextIndex] });
	});

	useHotkey("SPLIT_AUTO", () => {
		const state = store.getState();
		const active = state.getActivePane();
		if (!active) return;
		state.splitPane({
			tabId: active.tabId,
			paneId: active.pane.id,
			position: "right",
			newPane: {
				kind: "terminal",
				data: { terminalId: crypto.randomUUID() } as TerminalPaneData,
			},
		});
	});

	useHotkey("SPLIT_RIGHT", () => {
		const state = store.getState();
		const active = state.getActivePane();
		if (!active) return;
		state.splitPane({
			tabId: active.tabId,
			paneId: active.pane.id,
			position: "right",
			newPane: {
				kind: "terminal",
				data: { terminalId: crypto.randomUUID() } as TerminalPaneData,
			},
		});
	});

	useHotkey("SPLIT_DOWN", () => {
		const state = store.getState();
		const active = state.getActivePane();
		if (!active) return;
		state.splitPane({
			tabId: active.tabId,
			paneId: active.pane.id,
			position: "bottom",
			newPane: {
				kind: "terminal",
				data: { terminalId: crypto.randomUUID() } as TerminalPaneData,
			},
		});
	});

	useHotkey("SPLIT_WITH_CHAT", () => {
		const state = store.getState();
		const active = state.getActivePane();
		if (!active) return;
		state.splitPane({
			tabId: active.tabId,
			paneId: active.pane.id,
			position: "right",
			newPane: {
				kind: "chat",
				data: { sessionId: null } as ChatPaneData,
			},
		});
	});

	useHotkey("SPLIT_WITH_BROWSER", () => {
		const state = store.getState();
		const active = state.getActivePane();
		if (!active) return;
		state.splitPane({
			tabId: active.tabId,
			paneId: active.pane.id,
			position: "right",
			newPane: {
				kind: "browser",
				data: {
					url: "http://localhost:3000",
					mode: "preview",
				} as BrowserPaneData,
			},
		});
	});

	useHotkey("EQUALIZE_PANE_SPLITS", () => {
		const state = store.getState();
		const tab = state.getActiveTab();
		if (!tab) return;
		state.equalizeTab({ tabId: tab.id });
	});
}
