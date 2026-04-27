import type { WorkspaceStore } from "@superset/panes";
import { useCallback } from "react";
import type { StoreApi } from "zustand/vanilla";
import type {
	BrowserPaneData,
	ChatPaneData,
	CommentPaneData,
	DiffPaneData,
	PaneViewerData,
	TerminalPaneData,
} from "../../types";

export function useWorkspacePaneOpeners({
	store,
}: {
	store: StoreApi<WorkspaceStore<PaneViewerData>>;
}): {
	openDiffPane: (filePath: string, openInNewTab?: boolean) => void;
	addTerminalTab: () => void;
	addChatTab: () => void;
	addBrowserTab: () => void;
	openCommentPane: (comment: CommentPaneData) => void;
} {
	const openDiffPane = useCallback(
		(filePath: string, openInNewTab?: boolean) => {
			const state = store.getState();
			if (openInNewTab) {
				state.addTab({
					panes: [
						{
							kind: "diff",
							data: {
								path: filePath,
								collapsedFiles: [],
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
						collapsedFiles: [],
					} as DiffPaneData,
				},
			});
		},
		[store],
	);

	const addTerminalTab = useCallback(() => {
		store.getState().addTab({
			panes: [
				{
					kind: "terminal",
					data: {
						terminalId: crypto.randomUUID(),
					} as TerminalPaneData,
				},
			],
		});
	}, [store]);

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

	return {
		openDiffPane,
		addTerminalTab,
		addChatTab,
		addBrowserTab,
		openCommentPane,
	};
}
