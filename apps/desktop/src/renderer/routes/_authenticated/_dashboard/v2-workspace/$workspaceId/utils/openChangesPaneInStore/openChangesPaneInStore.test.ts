import { describe, expect, it } from "bun:test";
import {
	createWorkspaceStore,
	type LayoutNode,
	type WorkspaceState,
} from "@superset/panes";
import type { DiffPaneData, PaneViewerData } from "../../types";
import {
	closeVisibleChangesPane,
	findVisibleChangesPane,
	openChangesPaneInStore,
} from "./openChangesPaneInStore";

function paneLayout(paneId: string): LayoutNode {
	return { type: "pane", paneId };
}

function workspaceState(withDiffTab: boolean): WorkspaceState<PaneViewerData> {
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
						kind: "terminal",
						data: { terminalId: "terminal-1" } as PaneViewerData,
					},
				},
			},
			...(withDiffTab
				? [
						{
							id: "diff-tab",
							createdAt: 2,
							activePaneId: "diff-pane",
							layout: paneLayout("diff-pane"),
							panes: {
								"diff-pane": {
									id: "diff-pane",
									kind: "diff",
									data: {
										path: "src/app.ts",
										collapsedFiles: [],
									} as PaneViewerData,
								},
							},
						},
					]
				: []),
		],
	};
}

function storeWith(withDiffTab: boolean) {
	return createWorkspaceStore<PaneViewerData>({
		initialState: workspaceState(withDiffTab),
	});
}

describe("openChangesPaneInStore with target 'tab'", () => {
	it("adds a tab with an empty-target diff pane when none exists", () => {
		const store = storeWith(false);

		openChangesPaneInStore(store, "tab");

		const state = store.getState();
		expect(state.tabs).toHaveLength(2);
		const activeTab = state.tabs.find((tab) => tab.id === state.activeTabId);
		const opened = Object.values(activeTab?.panes ?? {})[0];
		expect(opened?.kind).toBe("diff");
		expect(opened?.data as DiffPaneData).toEqual({
			path: "",
			collapsedFiles: [],
		});
	});

	it("focuses the first existing diff pane across tabs instead of adding one", () => {
		const store = storeWith(true);

		openChangesPaneInStore(store, "tab");

		const state = store.getState();
		expect(state.tabs).toHaveLength(2);
		expect(state.activeTabId).toBe("diff-tab");
		const activeTab = state.tabs.find((tab) => tab.id === state.activeTabId);
		expect(activeTab?.activePaneId).toBe("diff-pane");
		// The existing pane's navigation target is untouched.
		const pane = activeTab?.panes["diff-pane"];
		expect((pane?.data as DiffPaneData).path).toBe("src/app.ts");
	});

	it("is idempotent once a diff pane exists", () => {
		const store = storeWith(false);

		openChangesPaneInStore(store, "tab");
		openChangesPaneInStore(store, "tab");

		expect(store.getState().tabs).toHaveLength(2);
	});
});

describe("openChangesPaneInStore with target 'pane' (default)", () => {
	it("splits the active tab with a diff pane instead of adding a tab", () => {
		const store = storeWith(false);

		openChangesPaneInStore(store);

		const state = store.getState();
		expect(state.tabs).toHaveLength(1);
		expect(state.activeTabId).toBe("tab-1");
		const activeTab = state.tabs[0];
		const panes = Object.values(activeTab?.panes ?? {});
		expect(panes).toHaveLength(2);
		const diffPane = panes.find((pane) => pane.kind === "diff");
		expect(diffPane).toBeDefined();
		expect(activeTab?.activePaneId).toBe(diffPane?.id ?? null);
		expect(diffPane?.data as DiffPaneData).toEqual({
			path: "",
			collapsedFiles: [],
		});
	});

	it("stays in the active tab even when another tab has a diff pane", () => {
		const store = storeWith(true);

		openChangesPaneInStore(store);

		const state = store.getState();
		expect(state.tabs).toHaveLength(2);
		expect(state.activeTabId).toBe("tab-1");
		const activeTab = state.tabs.find((tab) => tab.id === "tab-1");
		expect(
			Object.values(activeTab?.panes ?? {}).filter((p) => p.kind === "diff"),
		).toHaveLength(1);
	});

	it("focuses the active tab's existing diff pane instead of splitting again", () => {
		const store = storeWith(false);

		openChangesPaneInStore(store);
		const afterFirst = Object.keys(store.getState().tabs[0]?.panes ?? {});
		openChangesPaneInStore(store);

		const state = store.getState();
		expect(Object.keys(state.tabs[0]?.panes ?? {})).toEqual(afterFirst);
	});

	it("adds a tab when the workspace has none", () => {
		const store = createWorkspaceStore<PaneViewerData>({
			initialState: {
				version: 1,
				activeTabId: null,
				tabs: [],
			} as unknown as WorkspaceState<PaneViewerData>,
		});

		openChangesPaneInStore(store);

		const state = store.getState();
		expect(state.tabs).toHaveLength(1);
		const opened = Object.values(state.tabs[0]?.panes ?? {})[0];
		expect(opened?.kind).toBe("diff");
	});
});

describe("closeVisibleChangesPane", () => {
	it("ignores a diff pane in a background tab", () => {
		const store = storeWith(true);

		expect(findVisibleChangesPane(store.getState())).toBeNull();
		expect(closeVisibleChangesPane(store)).toBe(false);
		expect(store.getState().tabs).toHaveLength(2);
	});

	it("closes the active tab's split diff pane and keeps the tab", () => {
		const store = storeWith(false);
		openChangesPaneInStore(store, "pane");

		expect(findVisibleChangesPane(store.getState())?.tabId).toBe("tab-1");
		expect(closeVisibleChangesPane(store)).toBe(true);

		const state = store.getState();
		expect(state.tabs).toHaveLength(1);
		const panes = Object.values(state.tabs[0]?.panes ?? {});
		expect(panes.map((pane) => pane.kind)).toEqual(["terminal"]);
		expect(state.tabs[0]?.activePaneId).toBe("pane-1");
	});

	it("closes the focused diff pane when the tab holds several", () => {
		const diffPane = (id: string) => ({
			id,
			kind: "diff",
			data: { path: `src/${id}.ts`, collapsedFiles: [] } as PaneViewerData,
		});
		const store = createWorkspaceStore<PaneViewerData>({
			initialState: {
				version: 1,
				activeTabId: "tab-1",
				tabs: [
					{
						id: "tab-1",
						createdAt: 1,
						activePaneId: "diff-b",
						layout: {
							type: "split",
							direction: "horizontal",
							first: paneLayout("diff-a"),
							second: paneLayout("diff-b"),
						},
						panes: {
							"diff-a": diffPane("diff-a"),
							"diff-b": diffPane("diff-b"),
						},
					},
				],
			},
		});

		expect(findVisibleChangesPane(store.getState())?.paneId).toBe("diff-b");
		expect(closeVisibleChangesPane(store)).toBe(true);
		expect(Object.keys(store.getState().tabs[0]?.panes ?? {})).toEqual([
			"diff-a",
		]);
	});

	it("closes a diff-only tab entirely and activates a survivor", () => {
		const store = storeWith(true);
		store.getState().setActiveTab("diff-tab");

		expect(closeVisibleChangesPane(store)).toBe(true);

		const state = store.getState();
		expect(state.tabs.map((tab) => tab.id)).toEqual(["tab-1"]);
		expect(state.activeTabId).toBe("tab-1");
	});
});
