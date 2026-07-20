import { deriveWorkspacePanels, type WorkspaceStore } from "@superset/panes";
import { useCallback } from "react";
import type { V2TerminalPresetRow } from "renderer/routes/_authenticated/providers/CollectionsProvider/dashboardSidebarLocal";
import type { StoreApi } from "zustand/vanilla";
import type {
	BrowserPaneData,
	ChatPaneData,
	CommentPaneData,
	DiffFocusSide,
	DiffPaneData,
	PaneViewerData,
	TerminalPaneData,
} from "../../types";
import type { TerminalLauncher } from "../useV2TerminalLauncher";

export function useWorkspacePaneOpeners({
	store,
	launcher,
	newTabPresets,
	executePreset,
}: {
	store: StoreApi<WorkspaceStore<PaneViewerData>>;
	launcher: TerminalLauncher;
	newTabPresets: V2TerminalPresetRow[];
	executePreset: (
		preset: V2TerminalPresetRow,
		options?: { target?: "new-tab" | "active-tab" },
	) => void | Promise<void>;
}): {
	openDiffPane: (
		filePath: string,
		openInNewTab?: boolean,
		line?: number,
		side?: DiffFocusSide,
		changeKey?: string,
	) => void;
	addTerminalTab: (options?: { panelId?: string }) => Promise<void>;
	addChatTab: (options?: { panelId?: string }) => void;
	addBrowserTab: (options?: { panelId?: string }) => void;
	openCommentPane: (comment: CommentPaneData) => void;
} {
	const openDiffPane = useCallback(
		(
			filePath: string,
			openInNewTab?: boolean,
			line?: number,
			side?: DiffFocusSide,
			changeKey?: string,
		) => {
			const state = store.getState();
			// Bump the tick on every request so repeat clicks re-scroll and a
			// navigation into an unmounted pane wins over its older cached position.
			const focusFields = {
				focusLine: line,
				focusSide: line != null ? side : undefined,
				focusTick: Date.now(),
			};
			if (openInNewTab) {
				state.addTab({
					panes: [
						{
							kind: "diff",
							data: {
								path: filePath,
								changeKey,
								collapsedFiles: [],
								...focusFields,
							} as DiffPaneData,
						},
					],
				});
				return;
			}
			// Reuse an unpinned single-pane diff "preview" tab in the focused
			// panel (same scope as openPane), updating its data in place so
			// per-changeKey collapse state survives file switches.
			const derived = deriveWorkspacePanels(state);
			const panelTabIds = derived.tabIdsByPanel[derived.focusedPanelId] ?? [];
			const visibleTabId = derived.activeTabIdByPanel[derived.focusedPanelId];
			const candidates = visibleTabId
				? [visibleTabId, ...panelTabIds.filter((id) => id !== visibleTabId)]
				: panelTabIds;
			for (const tabId of candidates) {
				const tab = state.tabs.find((t) => t.id === tabId);
				if (!tab) continue;
				const panes = Object.values(tab.panes);
				const pane = panes.length === 1 ? panes[0] : undefined;
				if (!pane || pane.kind !== "diff" || pane.pinned) continue;
				const prev = pane.data as DiffPaneData;
				state.setPaneData({
					paneId: pane.id,
					data: {
						...prev,
						path: filePath,
						changeKey,
						// Only the navigated file's key can be pruned; without a
						// change key we can't identify it, so leave the set intact.
						collapsedFiles: changeKey
							? (prev.collapsedFiles ?? []).filter((key) => key !== changeKey)
							: (prev.collapsedFiles ?? []),
						...focusFields,
					} as PaneViewerData,
				});
				state.setActiveTab(tab.id);
				state.setActivePane({ tabId: tab.id, paneId: pane.id });
				return;
			}
			state.openPane({
				pane: {
					kind: "diff",
					data: {
						path: filePath,
						changeKey,
						collapsedFiles: [],
						...focusFields,
					} as DiffPaneData,
				},
			});
		},
		[store],
	);

	const addBlankTerminalTab = useCallback(
		async (options?: { panelId?: string }) => {
			const terminalId = await launcher.create();
			store.getState().addTab({
				panes: [
					{
						kind: "terminal",
						data: { terminalId } as TerminalPaneData,
					},
				],
				panelId: options?.panelId,
			});
		},
		[store, launcher],
	);

	const addTerminalTab = useCallback(
		async (options?: { panelId?: string }) => {
			if (newTabPresets.length === 0) {
				await addBlankTerminalTab(options);
				return;
			}

			// New terminal tabs are the trigger point for applyOnNewTab presets.
			// Each matching preset owns the tab/pane shape it creates; preset tabs
			// land in the focused panel (selecting a panel's bar focuses it).
			for (const preset of newTabPresets) {
				await executePreset(preset, { target: "new-tab" });
			}
		},
		[addBlankTerminalTab, executePreset, newTabPresets],
	);

	const addChatTab = useCallback(
		(options?: { panelId?: string }) => {
			store.getState().addTab({
				panes: [
					{
						kind: "chat",
						data: { sessionId: null } as ChatPaneData,
					},
				],
				panelId: options?.panelId,
			});
		},
		[store],
	);

	const addBrowserTab = useCallback(
		(options?: { panelId?: string }) => {
			store.getState().addTab({
				panes: [
					{
						kind: "browser",
						data: {
							url: "about:blank",
						} as BrowserPaneData,
					},
				],
				panelId: options?.panelId,
			});
		},
		[store],
	);

	const openCommentPane = useCallback(
		(comment: CommentPaneData) => {
			const state = store.getState();
			for (const tab of state.tabs) {
				for (const pane of Object.values(tab.panes)) {
					if (pane.kind !== "comment") continue;
					state.setPaneData({
						paneId: pane.id,
						data: comment as PaneViewerData,
					});
					state.setActiveTab(tab.id);
					state.setActivePane({ tabId: tab.id, paneId: pane.id });
					return;
				}
			}
			state.addTab({
				panes: [
					{
						kind: "comment",
						data: comment as PaneViewerData,
					},
				],
			});
		},
		[store],
	);

	return {
		openDiffPane,
		addTerminalTab,
		addChatTab,
		addBrowserTab,
		openCommentPane,
	};
}
