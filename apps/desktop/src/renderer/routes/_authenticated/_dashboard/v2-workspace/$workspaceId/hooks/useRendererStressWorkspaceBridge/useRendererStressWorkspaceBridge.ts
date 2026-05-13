import type { SelectV2Workspace } from "@superset/db/schema";
import type {
	CreatePaneInput,
	WorkspaceState,
	WorkspaceStore,
} from "@superset/panes";
import { useEffect, useRef } from "react";
import type { StoreApi } from "zustand/vanilla";
import type {
	BrowserPaneData,
	ChatPaneData,
	CommentPaneData,
	DiffPaneData,
	FilePaneData,
	PaneViewerData,
} from "../../types";

type RendererStressPaneKind = "browser" | "chat" | "comment" | "diff" | "file";
type RendererStressTabKind = RendererStressPaneKind | "terminal";

interface RendererStressSummary {
	workspaceId: string;
	projectId: string;
	activeTabId: string | null;
	tabCount: number;
	paneCount: number;
	paneKindCounts: Record<string, number>;
	filePathCount: number;
}

interface RendererStressWorkspaceBridge {
	workspaceId: string;
	projectId: string;
	captureBaseline: () => void;
	restoreBaseline: () => void;
	getSummary: () => RendererStressSummary;
	addTab: (
		kind: RendererStressTabKind,
		index: number,
		paneCount?: number,
	) => void;
	openPane: (kind: RendererStressPaneKind, index: number) => void;
	splitActivePane: (kind: RendererStressPaneKind, index: number) => void;
	switchTab: (index: number) => void;
	closeActivePane: () => void;
	closeOldestTab: (keepCount?: number) => void;
	churnActivePaneData: (index: number) => void;
	replaceWithGeneratedLayout: (tabCount: number, panesPerTab: number) => void;
	addRealTerminalTab: () => Promise<void>;
}

declare global {
	interface Window {
		__SUPERSET_RENDERER_STRESS__?: RendererStressWorkspaceBridge;
	}
}

const FALLBACK_FILE_ROOT = "/tmp/superset-renderer-stress";

function cloneWorkspaceState(
	state: WorkspaceState<PaneViewerData>,
): WorkspaceState<PaneViewerData> {
	return JSON.parse(JSON.stringify(state)) as WorkspaceState<PaneViewerData>;
}

function getStoreStateSnapshot(
	store: StoreApi<WorkspaceStore<PaneViewerData>>,
): WorkspaceState<PaneViewerData> {
	const state = store.getState();
	return cloneWorkspaceState({
		version: state.version,
		tabs: state.tabs,
		activeTabId: state.activeTabId,
	});
}

function getFilePath(filePaths: string[], index: number): string {
	if (filePaths.length > 0) {
		return filePaths[index % filePaths.length];
	}
	return `${FALLBACK_FILE_ROOT}/fixture-${index % 25}.tsx`;
}

function createStressPane(
	kind: RendererStressPaneKind,
	index: number,
	filePaths: string[],
): CreatePaneInput<PaneViewerData> {
	const filePath = getFilePath(filePaths, index);
	switch (kind) {
		case "browser":
			return {
				kind,
				data: {
					url: index % 3 === 0 ? "about:blank" : "https://example.com/",
				} satisfies BrowserPaneData,
			};
		case "chat":
			return {
				kind,
				data: {
					sessionId: null,
					launchConfig:
						index % 2 === 0
							? { initialPrompt: `renderer stress prompt ${index}` }
							: null,
				} satisfies ChatPaneData,
			};
		case "comment":
			return {
				kind,
				data: {
					commentId: `renderer-stress-comment-${index}`,
					authorLogin: "renderer-stress",
					body: `Renderer stress comment ${index}`,
					path: filePath,
					line: (index % 200) + 1,
				} satisfies CommentPaneData,
			};
		case "diff":
			return {
				kind,
				data: {
					path: filePath,
					collapsedFiles: index % 2 === 0 ? [] : [filePath],
					expandedFiles: [filePath],
					focusLine: (index % 200) + 1,
					focusTick: Date.now(),
				} satisfies DiffPaneData,
			};
		case "file":
			return {
				kind,
				data: {
					filePath,
					mode: index % 3 === 0 ? "preview" : "editor",
				} satisfies FilePaneData,
			};
	}
}

function getNextPaneKind(index: number): RendererStressPaneKind {
	const kinds: RendererStressPaneKind[] = [
		"file",
		"diff",
		"browser",
		"chat",
		"comment",
	];
	return kinds[index % kinds.length];
}

function isRendererStressPaneKind(
	kind: string,
): kind is RendererStressPaneKind {
	return (
		kind === "browser" ||
		kind === "chat" ||
		kind === "comment" ||
		kind === "diff" ||
		kind === "file"
	);
}

function getSummary(
	workspace: SelectV2Workspace,
	store: StoreApi<WorkspaceStore<PaneViewerData>>,
	filePaths: string[],
): RendererStressSummary {
	const state = store.getState();
	const paneKindCounts: Record<string, number> = {};
	let paneCount = 0;
	for (const tab of state.tabs) {
		for (const pane of Object.values(tab.panes)) {
			paneCount += 1;
			paneKindCounts[pane.kind] = (paneKindCounts[pane.kind] ?? 0) + 1;
		}
	}
	return {
		workspaceId: workspace.id,
		projectId: workspace.projectId,
		activeTabId: state.activeTabId,
		tabCount: state.tabs.length,
		paneCount,
		paneKindCounts,
		filePathCount: filePaths.length,
	};
}

export function useRendererStressWorkspaceBridge({
	workspace,
	store,
	filePaths,
	addTerminalTab,
}: {
	workspace: SelectV2Workspace;
	store: StoreApi<WorkspaceStore<PaneViewerData>>;
	filePaths: string[];
	addTerminalTab: () => Promise<void>;
}) {
	const baselineRef = useRef<WorkspaceState<PaneViewerData> | null>(null);

	useEffect(() => {
		if (process.env.NODE_ENV !== "development") return;

		const getBridgeSummary = () => getSummary(workspace, store, filePaths);
		const bridge: RendererStressWorkspaceBridge = {
			workspaceId: workspace.id,
			projectId: workspace.projectId,
			captureBaseline: () => {
				baselineRef.current = getStoreStateSnapshot(store);
			},
			restoreBaseline: () => {
				const baseline = baselineRef.current;
				if (!baseline) return;
				store.getState().replaceState(cloneWorkspaceState(baseline));
			},
			getSummary: getBridgeSummary,
			addTab: (kind, index, paneCount = 1) => {
				if (kind === "terminal") {
					void addTerminalTab();
					return;
				}
				const count = Math.max(1, Math.min(8, Math.floor(paneCount)));
				store.getState().addTab({
					panes: Array.from({ length: count }, (_, offset) =>
						createStressPane(
							offset === 0 ? kind : getNextPaneKind(index + offset),
							index + offset,
							filePaths,
						),
					) as [
						CreatePaneInput<PaneViewerData>,
						...CreatePaneInput<PaneViewerData>[],
					],
				});
			},
			openPane: (kind, index) => {
				store.getState().openPane({
					pane: createStressPane(kind, index, filePaths),
				});
			},
			splitActivePane: (kind, index) => {
				const state = store.getState();
				const active = state.getActivePane();
				if (!active) {
					bridge.addTab(kind, index);
					return;
				}
				state.splitPane({
					tabId: active.tabId,
					paneId: active.pane.id,
					position: index % 2 === 0 ? "right" : "bottom",
					newPane: createStressPane(kind, index, filePaths),
				});
			},
			switchTab: (index) => {
				const state = store.getState();
				if (state.tabs.length === 0) return;
				state.setActiveTab(state.tabs[index % state.tabs.length].id);
			},
			closeActivePane: () => {
				const state = store.getState();
				const active = state.getActivePane();
				if (!active) return;
				state.closePane({ tabId: active.tabId, paneId: active.pane.id });
			},
			closeOldestTab: (keepCount = 4) => {
				const state = store.getState();
				if (state.tabs.length <= keepCount) return;
				state.removeTab(state.tabs[0].id);
			},
			churnActivePaneData: (index) => {
				const state = store.getState();
				const active = state.getActivePane();
				if (!active) {
					bridge.addTab("file", index);
					return;
				}
				const nextKind = isRendererStressPaneKind(active.pane.kind)
					? active.pane.kind
					: "file";
				state.setPaneData({
					paneId: active.pane.id,
					data: createStressPane(nextKind, index, filePaths).data,
				});
			},
			replaceWithGeneratedLayout: (tabCount, panesPerTab) => {
				store.getState().replaceState({
					version: 1,
					tabs: [],
					activeTabId: null,
				});
				const boundedTabCount = Math.max(1, Math.min(50, Math.floor(tabCount)));
				const boundedPaneCount = Math.max(
					1,
					Math.min(8, Math.floor(panesPerTab)),
				);
				for (let tabIndex = 0; tabIndex < boundedTabCount; tabIndex += 1) {
					bridge.addTab(
						getNextPaneKind(tabIndex),
						tabIndex * 10,
						boundedPaneCount,
					);
				}
			},
			addRealTerminalTab: addTerminalTab,
		};

		window.__SUPERSET_RENDERER_STRESS__ = bridge;
		return () => {
			if (window.__SUPERSET_RENDERER_STRESS__ === bridge) {
				delete window.__SUPERSET_RENDERER_STRESS__;
			}
		};
	}, [addTerminalTab, filePaths, store, workspace]);
}
