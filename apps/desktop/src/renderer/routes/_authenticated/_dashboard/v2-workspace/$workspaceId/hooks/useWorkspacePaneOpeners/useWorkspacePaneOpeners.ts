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
import type { TerminalLauncher } from "../useV2TerminalLauncher";

export function useWorkspacePaneOpeners({
	store,
	launcher,
}: {
	store: StoreApi<WorkspaceStore<PaneViewerData>>;
	launcher: TerminalLauncher;
}): {
	openDiffPane: (
		filePath: string,
		openInNewTab?: boolean,
		line?: number,
	) => void;
	addTerminalTab: () => Promise<void>;
	addChatTab: () => void;
	addBrowserTab: () => void;
	openCommentPane: (comment: CommentPaneData) => void;
} {
	const openDiffPane = useCallback(
		(filePath: string, openInNewTab?: boolean, line?: number) => {
			const state = store.getState();
			// Bump tick on every request so ScrollToFile re-fires on repeat
			// clicks; clear when no line is given so reused panes don't jump
			// to a stale focus.
			const focusFields =
				line != null
					? { focusLine: line, focusTick: Date.now() }
					: { focusLine: undefined, focusTick: undefined };
			if (openInNewTab) {
				state.addTab({
					panes: [
						{
							kind: "diff",
							data: {
								path: filePath,
								collapsedFiles: [],
								expandedFiles: [filePath],
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
					const prevExpanded = prev.expandedFiles ?? [];
					state.setPaneData({
						paneId: pane.id,
						data: {
							...prev,
							path: filePath,
							collapsedFiles: (prev.collapsedFiles ?? []).filter(
								(p) => p !== filePath,
							),
							expandedFiles: prevExpanded.includes(filePath)
								? prevExpanded
								: [...prevExpanded, filePath],
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
						collapsedFiles: [],
						expandedFiles: [filePath],
						...focusFields,
					} as DiffPaneData,
				},
			});
		},
		[store],
	);

	const addTerminalTab = useCallback(async () => {
		const terminalId = await launcher.create();
		store.getState().addTab({
			panes: [
				{
					kind: "terminal",
					data: { terminalId } as TerminalPaneData,
				},
			],
		});
	}, [store, launcher]);

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
