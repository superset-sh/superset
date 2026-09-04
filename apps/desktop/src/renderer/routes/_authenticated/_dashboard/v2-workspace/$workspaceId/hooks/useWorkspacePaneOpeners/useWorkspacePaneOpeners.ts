import type { WorkspaceStore } from "@superset/panes";
import { useCallback } from "react";
import type { V2UserPreferencesApi } from "renderer/hooks/useV2UserPreferences";
import { useWorkspace } from "renderer/routes/_authenticated/_dashboard/v2-workspace/providers/WorkspaceProvider";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import type { V2TerminalPresetRow } from "renderer/routes/_authenticated/providers/CollectionsProvider/dashboardSidebarLocal";
import { useSettings } from "renderer/stores/settings";
import type { StoreApi } from "zustand/vanilla";
import type {
	BrowserPaneData,
	ChatV3PaneData,
	CommentPaneData,
	DiffFocusSide,
	DiffPaneData,
	PagePaneData,
	PaneViewerData,
	TerminalPaneData,
} from "../../types";
import {
	closeVisibleChangesPane,
	openChangesPaneInStore,
} from "../../utils/openChangesPaneInStore";
import { openPagePaneInStore } from "../../utils/openPagePaneInStore";
import {
	getWorkspaceSidebarTab,
	setWorkspaceSidebarTab,
} from "../../utils/setWorkspaceSidebarTab";
import { useDefaultBrowserUrl } from "../useDefaultBrowserUrl";
import type { TerminalLauncher } from "../useV2TerminalLauncher";

export function useWorkspacePaneOpeners({
	store,
	launcher,
	newTabPresets,
	executePreset,
	setRightSidebarOpen,
}: {
	store: StoreApi<WorkspaceStore<PaneViewerData>>;
	launcher: TerminalLauncher;
	newTabPresets: V2TerminalPresetRow[];
	executePreset: (
		preset: V2TerminalPresetRow,
		options?: { target?: "new-tab" | "active-tab" },
	) => void | Promise<void>;
	setRightSidebarOpen: V2UserPreferencesApi["setRightSidebarOpen"];
}): {
	openDiffPane: (
		filePath: string,
		openInNewTab?: boolean,
		line?: number,
		side?: DiffFocusSide,
		changeKey?: string,
	) => void;
	addTerminalTab: () => Promise<void>;
	addChatV3Tab: () => void;
	addBrowserTab: () => void;
	openChangesPane: () => void;
	/** Close the visible Changes pane, or open/focus one when none is showing. */
	toggleChangesPane: () => void;
	openCommentPane: (comment: CommentPaneData) => void;
	openPagePane: (page: PagePaneData) => void;
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
			for (const tab of state.tabs) {
				for (const pane of Object.values(tab.panes)) {
					if (pane.kind !== "diff") continue;
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

	const addBlankTerminalTab = useCallback(() => {
		store.getState().addTab({
			panes: [
				{
					kind: "terminal",
					data: {
						terminalId: launcher.mint(),
						createOnAttach: true,
					} as TerminalPaneData,
				},
			],
		});
	}, [store, launcher]);

	const addTerminalTab = useCallback(async () => {
		if (newTabPresets.length === 0) {
			addBlankTerminalTab();
			return;
		}

		// New terminal tabs are the trigger point for applyOnNewTab presets.
		// Each matching preset owns the tab/pane shape it creates.
		for (const preset of newTabPresets) {
			await executePreset(preset, { target: "new-tab" });
		}
	}, [addBlankTerminalTab, executePreset, newTabPresets]);

	const addChatV3Tab = useCallback(() => {
		store.getState().addTab({
			panes: [
				{
					kind: "chat-v3",
					data: { sessionId: null } as ChatV3PaneData,
				},
			],
		});
	}, [store]);

	const defaultBrowserUrl = useDefaultBrowserUrl();
	const addBrowserTab = useCallback(() => {
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
	}, [store, defaultBrowserUrl]);

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

	const { workspace } = useWorkspace();
	const collections = useCollections();
	// The changed-files list lives in the sidebar's Changes tab, so opening
	// Changes reveals it alongside the pane — with the sidebar closed the pane
	// alone would have no file picker.
	const openChangesPane = useCallback(() => {
		setRightSidebarOpen(true);
		setWorkspaceSidebarTab(collections, workspace.id, "changes");
		openChangesPaneInStore(store, useSettings.getState().changesOpenTarget);
	}, [store, setRightSidebarOpen, collections, workspace.id]);

	// Opening brings the sidebar along on Changes, so closing takes it back
	// down — unless the sidebar has since moved to Files or Review, where
	// it's serving something else and stays.
	const toggleChangesPane = useCallback(() => {
		if (closeVisibleChangesPane(store)) {
			if (getWorkspaceSidebarTab(collections, workspace.id) === "changes") {
				setRightSidebarOpen(false);
			}
			return;
		}
		openChangesPane();
	}, [store, openChangesPane, collections, workspace.id, setRightSidebarOpen]);

	const openPagePane = useCallback(
		(page: PagePaneData) => {
			openPagePaneInStore(store, page);
		},
		[store],
	);

	return {
		openDiffPane,
		addTerminalTab,
		addChatV3Tab,
		addBrowserTab,
		openChangesPane,
		toggleChangesPane,
		openCommentPane,
		openPagePane,
	};
}
