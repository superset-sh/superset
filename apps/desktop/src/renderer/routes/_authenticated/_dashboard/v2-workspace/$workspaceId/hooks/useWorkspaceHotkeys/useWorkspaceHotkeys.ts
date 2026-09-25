import {
	type FocusDirection,
	getPaneParentDirection,
	getSpatialNeighborPaneId,
	type PaneRegistry,
	type WorkspaceProps,
	type WorkspaceStore,
} from "@superset/panes";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { useV2UserPreferences } from "renderer/hooks/useV2UserPreferences";
import { useHotkey } from "renderer/hotkeys";
import type { V2TerminalPresetRow } from "renderer/routes/_authenticated/providers/CollectionsProvider/dashboardSidebarLocal";
import { useRightSidebarToggleIntent } from "renderer/stores/right-sidebar-toggle-intent";
import type { StoreApi } from "zustand";
import type {
	BrowserPaneData,
	DesktopPaneData,
	PaneViewerData,
	TerminalPaneData,
} from "../../types";
import { useDefaultBrowserUrl } from "../useDefaultBrowserUrl";
import type { TerminalLauncher } from "../useV2TerminalLauncher";

export function useWorkspaceHotkeys({
	store,
	matchedPresets,
	executePreset,
	addTerminalTab,
	openChangesPane,
	paneRegistry,
	launcher,
	onBeforeCloseTab,
	isSandbox,
}: {
	store: StoreApi<WorkspaceStore<PaneViewerData>>;
	matchedPresets: V2TerminalPresetRow[];
	executePreset: (preset: V2TerminalPresetRow) => void | Promise<void>;
	addTerminalTab: () => Promise<void>;
	openChangesPane: () => void;
	paneRegistry: PaneRegistry<PaneViewerData>;
	launcher: TerminalLauncher;
	isSandbox: boolean;
	onBeforeCloseTab?: WorkspaceProps<PaneViewerData>["onBeforeCloseTab"];
}) {
	const { setRightSidebarOpen } = useV2UserPreferences();
	const defaultBrowserUrl = useDefaultBrowserUrl();
	const visiblePresets = useMemo(
		() => matchedPresets.filter((preset) => preset.pinnedToBar !== false),
		[matchedPresets],
	);

	useHotkey("TOGGLE_SIDEBAR", () => {
		setRightSidebarOpen((prev) => !prev);
	});

	useEffect(
		() =>
			useRightSidebarToggleIntent.subscribe((state, prev) => {
				if (state.tick !== prev.tick) setRightSidebarOpen((open) => !open);
			}),
		[setRightSidebarOpen],
	);

	// --- Tab creation ---

	useHotkey("NEW_GROUP", async () => {
		await addTerminalTab();
	});

	useHotkey("NEW_BROWSER", () => {
		store.getState().addTab({
			panes: [
				{
					kind: "browser",
					data: {
						url: defaultBrowserUrl,
					} as BrowserPaneData,
				},
			],
		});
	});

	useHotkey("OPEN_DIFF_VIEWER", () => {
		openChangesPane();
	});

	// --- Tab management ---

	const isClosingPaneRef = useRef(false);
	useHotkey("CLOSE_PANE", async () => {
		if (isClosingPaneRef.current) return;
		isClosingPaneRef.current = true;
		try {
			const state = store.getState();
			const active = state.getActivePane();
			if (!active) return;
			const definition = paneRegistry[active.pane.kind];
			if (definition?.onBeforeClose) {
				const allowed = await definition.onBeforeClose(active.pane);
				if (!allowed) return;
			}
			state.closePane({ tabId: active.tabId, paneId: active.pane.id });
		} finally {
			isClosingPaneRef.current = false;
		}
	});

	const isClosingTabRef = useRef(false);
	useHotkey("CLOSE_TAB", async () => {
		if (isClosingTabRef.current) return;
		isClosingTabRef.current = true;
		try {
			const state = store.getState();
			const tab = state.getActiveTab();
			if (!tab) return;
			if (onBeforeCloseTab) {
				const allowed = await onBeforeCloseTab(tab);
				if (!allowed) return;
			}
			state.removeTab(tab.id);
		} finally {
			isClosingTabRef.current = false;
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

	const moveFocusDirectional = useCallback(
		(dir: FocusDirection) => {
			const state = store.getState();
			const tab = state.getActiveTab();
			if (!tab || !tab.activePaneId) return;
			const neighbor = getSpatialNeighborPaneId(
				tab.layout,
				tab.activePaneId,
				dir,
			);
			if (neighbor) state.setActivePane({ tabId: tab.id, paneId: neighbor });
		},
		[store],
	);

	useHotkey("FOCUS_PANE_LEFT", () => moveFocusDirectional("left"));
	useHotkey("FOCUS_PANE_RIGHT", () => moveFocusDirectional("right"));
	useHotkey("FOCUS_PANE_UP", () => moveFocusDirectional("up"));
	useHotkey("FOCUS_PANE_DOWN", () => moveFocusDirectional("down"));

	useHotkey("SPLIT_AUTO", () => {
		const state = store.getState();
		const active = state.getActivePane();
		if (!active) return;
		const tab = state.getActiveTab();
		const parentDirection = tab
			? getPaneParentDirection(tab.layout, active.pane.id)
			: null;
		const position = parentDirection === "horizontal" ? "bottom" : "right";
		state.splitPane({
			tabId: active.tabId,
			paneId: active.pane.id,
			position,
			newPane: {
				kind: "terminal",
				data: {
					terminalId: launcher.mint(),
					createOnAttach: true,
				} as TerminalPaneData,
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
				data: {
					terminalId: launcher.mint(),
					createOnAttach: true,
				} as TerminalPaneData,
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
				data: {
					terminalId: launcher.mint(),
					createOnAttach: true,
				} as TerminalPaneData,
			},
		});
	});

	useHotkey(
		"SPLIT_WITH_DESKTOP",
		() => {
			const state = store.getState();
			const active = state.getActivePane();
			if (!active) return;
			state.splitPane({
				tabId: active.tabId,
				paneId: active.pane.id,
				position: "right",
				newPane: {
					kind: "desktop",
					data: { kind: "desktop" } as DesktopPaneData,
				},
			});
		},
		{ enabled: isSandbox },
	);

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
					url: defaultBrowserUrl,
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

	// --- Preset hotkeys ---

	const openPresetByIndex = useCallback(
		(index: number) => {
			const preset = visiblePresets[index];
			if (preset) executePreset(preset);
		},
		[visiblePresets, executePreset],
	);

	useHotkey("OPEN_PRESET_1", () => openPresetByIndex(0));
	useHotkey("OPEN_PRESET_2", () => openPresetByIndex(1));
	useHotkey("OPEN_PRESET_3", () => openPresetByIndex(2));
	useHotkey("OPEN_PRESET_4", () => openPresetByIndex(3));
	useHotkey("OPEN_PRESET_5", () => openPresetByIndex(4));
	useHotkey("OPEN_PRESET_6", () => openPresetByIndex(5));
	useHotkey("OPEN_PRESET_7", () => openPresetByIndex(6));
	useHotkey("OPEN_PRESET_8", () => openPresetByIndex(7));
	useHotkey("OPEN_PRESET_9", () => openPresetByIndex(8));
}
