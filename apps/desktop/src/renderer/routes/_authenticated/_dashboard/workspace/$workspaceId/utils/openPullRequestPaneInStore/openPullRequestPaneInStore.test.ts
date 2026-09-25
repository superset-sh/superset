import { describe, expect, it } from "bun:test";
import {
	createWorkspaceStore,
	type LayoutNode,
	type WorkspaceState,
	type WorkspaceStore,
} from "@superset/panes";
import type { StoreApi } from "zustand/vanilla";
import type { PaneViewerData, PullRequestPaneData } from "../../types";
import { openPullRequestPaneInStore } from "./openPullRequestPaneInStore";

function paneLayout(paneId: string): LayoutNode {
	return { type: "pane", paneId };
}

function workspaceState(existing?: {
	tabId: string;
	paneId: string;
	prNumber: number;
}): WorkspaceState<PaneViewerData> {
	return {
		version: 1,
		activeTabId: "tab-1",
		tabs: [
			{
				id: "tab-1",
				createdAt: 1,
				activePaneId: "pane-1",
				layout: paneLayout("pane-1"),
				panes: {
					"pane-1": {
						id: "pane-1",
						kind: "diff",
						data: { path: "", collapsedFiles: [] } as PaneViewerData,
					},
				},
			},
			...(existing
				? [
						{
							id: existing.tabId,
							createdAt: 2,
							activePaneId: existing.paneId,
							layout: paneLayout(existing.paneId),
							panes: {
								[existing.paneId]: {
									id: existing.paneId,
									kind: "pull-request",
									data: {
										prNumber: existing.prNumber,
									} as PaneViewerData,
								},
							},
						},
					]
				: []),
		],
	};
}

function findPullRequestPanes(store: StoreApi<WorkspaceStore<PaneViewerData>>) {
	return store.getState().tabs.flatMap((tab) =>
		Object.values(tab.panes)
			.filter((pane) => pane.kind === "pull-request")
			.map((pane) => ({ tabId: tab.id, pane })),
	);
}

describe("openPullRequestPaneInStore", () => {
	it("splits the active pane when no pull-request pane exists", () => {
		const store = createWorkspaceStore<PaneViewerData>({
			initialState: workspaceState(),
		});

		openPullRequestPaneInStore(store, 42);

		const state = store.getState();
		expect(state.tabs).toHaveLength(1);
		const panes = findPullRequestPanes(store);
		expect(panes).toHaveLength(1);
		expect((panes[0]?.pane.data as PullRequestPaneData).prNumber).toBe(42);
		expect(state.tabs[0]?.activePaneId).toBe(panes[0]?.pane.id);
		expect(state.tabs[0]?.layout.type).toBe("split");
	});

	it("focuses an existing pane for the same PR without touching its data", () => {
		const store = createWorkspaceStore<PaneViewerData>({
			initialState: workspaceState({
				tabId: "tab-2",
				paneId: "pr-pane",
				prNumber: 42,
			}),
		});
		const before = store.getState().tabs[1]?.panes["pr-pane"]?.data;

		openPullRequestPaneInStore(store, 42);

		const state = store.getState();
		expect(state.activeTabId).toBe("tab-2");
		expect(state.tabs[1]?.activePaneId).toBe("pr-pane");
		expect(state.tabs[1]?.panes["pr-pane"]?.data).toBe(before);
		expect(findPullRequestPanes(store)).toHaveLength(1);
	});

	it("retargets the existing pane when the PR number changes", () => {
		const store = createWorkspaceStore<PaneViewerData>({
			initialState: workspaceState({
				tabId: "tab-2",
				paneId: "pr-pane",
				prNumber: 42,
			}),
		});

		openPullRequestPaneInStore(store, 43);

		const panes = findPullRequestPanes(store);
		expect(panes).toHaveLength(1);
		expect((panes[0]?.pane.data as PullRequestPaneData).prNumber).toBe(43);
		expect(store.getState().activeTabId).toBe("tab-2");
	});
});
