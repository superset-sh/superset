import type { WorkspaceStore } from "@superset/panes";
import { useCallback } from "react";
import type { V2TerminalPresetRow } from "renderer/routes/_authenticated/providers/CollectionsProvider/dashboardSidebarLocal";
import type { GraphSelection } from "renderer/routes/_authenticated/providers/CollectionsProvider/dashboardSidebarLocal/schema";
import type { StoreApi } from "zustand/vanilla";
import type {
	BrowserPaneData,
	ChatPaneData,
	ChatV3PaneData,
	CommentPaneData,
	DiffFocusSide,
	DiffPaneData,
	PaneViewerData,
	TerminalPaneData,
} from "../../types";
import type { TerminalLauncher } from "../useV2TerminalLauncher";

/** Structural equality for graph refs, so an already-open commit pane is focused
 *  instead of duplicated. */
function sameRef(a: GraphSelection | undefined, b: GraphSelection): boolean {
	if (!a || a.kind !== b.kind) return false;
	if (a.kind === "commit" && b.kind === "commit") return a.hash === b.hash;
	if (a.kind === "range" && b.kind === "range")
		return a.fromHash === b.fromHash && a.toHash === b.toHash;
	return false;
}

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
	openCommitDiffPane: (ref: GraphSelection, openInNewTab?: boolean) => void;
	pinActiveCommitPane: () => void;
	addTerminalTab: () => Promise<void>;
	addChatTab: () => void;
	addChatV3Tab: () => void;
	addBrowserTab: () => void;
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

	const addChatTab = useCallback(() => {
		store.getState().addTab({
			panes: [
				{
					kind: "chat",
					data: { sessionId: null } as ChatPaneData,
				},
			],
		});
	}, [store]);

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

	const addBrowserTab = useCallback(() => {
		store.getState().addTab({
			panes: [
				{
					kind: "browser",
					data: {
						url: "about:blank",
					} as BrowserPaneData,
				},
			],
		});
	}, [store]);

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

	const openCommitDiffPane = useCallback(
		(ref: GraphSelection, openInNewTab?: boolean) => {
			const state = store.getState();
			// A commit pane shows the whole changeset; CodeView renders every file,
			// so an empty path simply means "no specific file focused".
			const paneData = {
				ref,
				collapsedFiles: [],
				path: "",
			} as DiffPaneData;

			// cmd/ctrl-click: always a fresh pane, never a reuse.
			if (openInNewTab) {
				state.addTab({ panes: [{ kind: "diff", data: paneData }] });
				return;
			}

			// Focus an existing pane already showing this exact ref (any tab)
			// before reusing or creating — same convention as the file tree.
			for (const tab of state.tabs) {
				for (const pane of Object.values(tab.panes)) {
					if (pane.kind !== "diff") continue;
					if (sameRef((pane.data as DiffPaneData).ref, ref)) {
						state.setActiveTab(tab.id);
						state.setActivePane({ tabId: tab.id, paneId: pane.id });
						return;
					}
				}
			}

			// Reuse the unpinned ref-carrying diff pane in the active tab; replace
			// its ref. ONLY ref-carrying panes are eligible — the discriminator
			// `data.ref === undefined` marks the Changes tab's follower pane, which
			// a graph click must never hijack.
			const activeTabId = state.activeTabId;
			const activeTab = activeTabId
				? state.tabs.find((t) => t.id === activeTabId)
				: null;
			if (activeTab) {
				const reusable = Object.values(activeTab.panes).find(
					(p) =>
						p.kind === "diff" &&
						!p.pinned &&
						(p.data as DiffPaneData).ref !== undefined,
				);
				if (reusable) {
					state.replacePane({
						tabId: activeTab.id,
						paneId: reusable.id,
						newPane: { kind: "diff", data: paneData },
					});
					return;
				}
				// No reusable ref pane: add a new one (split), leaving the Changes
				// follower pane untouched.
				state.addPane({
					tabId: activeTab.id,
					pane: { kind: "diff", data: paneData },
				});
				return;
			}

			// No active tab: seed one with the commit pane.
			state.addTab({ panes: [{ kind: "diff", data: paneData }] });
		},
		[store],
	);

	/** Pin the diff pane a single click just opened. No-op unless the active
	 *  pane is a ref-carrying commit diff (double-clicking the Changes tab's
	 *  follower pane does nothing). */
	const pinActiveCommitPane = useCallback(() => {
		const state = store.getState();
		const active = state.getActivePane();
		if (
			active?.pane.kind === "diff" &&
			(active.pane.data as DiffPaneData).ref
		) {
			state.setPanePinned({
				paneId: active.pane.id,
				pinned: true,
			});
		}
	}, [store]);

	return {
		openDiffPane,
		openCommitDiffPane,
		pinActiveCommitPane,
		addTerminalTab,
		addChatTab,
		addChatV3Tab,
		addBrowserTab,
		openCommentPane,
	};
}
