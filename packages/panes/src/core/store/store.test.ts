import { describe, expect, it } from "bun:test";
import type { Tab, WorkspaceState } from "../../types";
import type { CreatePaneInput } from "./store";
import { createWorkspaceStore } from "./store";

interface TestData {
	label: string;
}

function tp(id: string, label = id): CreatePaneInput<TestData> {
	return { id, kind: "test", data: { label } };
}

function makeStore(initialState?: WorkspaceState<TestData>) {
	return createWorkspaceStore<TestData>(
		initialState ? { initialState } : undefined,
	);
}

describe("tab operations", () => {
	it("adds a tab and auto-sets activeTabId", () => {
		const store = makeStore();

		store.getState().addTab({ id: "t1", panes: [tp("p1")] });

		expect(store.getState().tabs).toHaveLength(1);
		expect(store.getState().activeTabId).toBe("t1");
	});

	it("removes the active tab and falls back to neighbor", () => {
		const store = makeStore();
		store.getState().addTab({ id: "t1", panes: [tp("p1")] });
		store.getState().addTab({ id: "t2", panes: [tp("p2")] });
		store.getState().setActiveTab("t1");

		store.getState().removeTab("t1");

		expect(store.getState().tabs).toHaveLength(1);
		expect(store.getState().activeTabId).toBe("t2");
	});

	it("removes the only tab and sets activeTabId to null", () => {
		const store = makeStore();
		store.getState().addTab({ id: "t1", panes: [tp("p1")] });

		store.getState().removeTab("t1");

		expect(store.getState().tabs).toHaveLength(0);
		expect(store.getState().activeTabId).toBeNull();
	});

	it("sets active tab", () => {
		const store = makeStore();
		store.getState().addTab({ id: "t1", panes: [tp("p1")] });
		store.getState().addTab({ id: "t2", panes: [tp("p2")] });

		store.getState().setActiveTab("t2");
		expect(store.getState().activeTabId).toBe("t2");
	});

	it("sets tab title override", () => {
		const store = makeStore();
		store.getState().addTab({ id: "t1", panes: [tp("p1")] });

		store.getState().setTabTitleOverride({
			tabId: "t1",
			titleOverride: "Renamed",
		});

		expect(store.getState().tabs[0]?.titleOverride).toBe("Renamed");
	});
});

describe("pane operations", () => {
	it("sets active pane within a tab", () => {
		const store = makeStore();
		store.getState().addTab({
			id: "t1",
			panes: [tp("p1"), tp("p2")],
			activePaneId: "p1",
		});

		store.getState().setActivePane({ tabId: "t1", paneId: "p2" });
		expect(store.getState().tabs[0]?.activePaneId).toBe("p2");
	});

	it("gets pane by ID across tabs", () => {
		const store = makeStore();
		store.getState().addTab({ id: "t1", panes: [tp("p1")] });
		store.getState().addTab({ id: "t2", panes: [tp("p2", "second")] });

		const result = store.getState().getPane("p2");
		expect(result?.tabId).toBe("t2");
		expect(result?.pane.data.label).toBe("second");
	});

	it("gets active pane with and without explicit tabId", () => {
		const store = makeStore();
		store.getState().addTab({
			id: "t1",
			panes: [tp("p1", "A")],
			activePaneId: "p1",
		});
		store.getState().addTab({
			id: "t2",
			panes: [tp("p2", "B")],
			activePaneId: "p2",
		});
		store.getState().setActiveTab("t2");

		expect(store.getState().getActivePane()?.pane.data.label).toBe("B");
		expect(store.getState().getActivePane("t1")?.pane.data.label).toBe("A");
	});

	it("sets pane data in-place", () => {
		const store = makeStore();
		store.getState().addTab({ id: "t1", panes: [tp("p1", "old")] });

		store.getState().setPaneData({ paneId: "p1", data: { label: "new" } });
		expect(store.getState().getPane("p1")?.pane.data.label).toBe("new");
	});

	it("sets pane title override", () => {
		const store = makeStore();
		store.getState().addTab({ id: "t1", panes: [tp("p1")] });

		store.getState().setPaneTitleOverride({
			tabId: "t1",
			paneId: "p1",
			titleOverride: "Custom",
		});

		expect(store.getState().getPane("p1")?.pane.titleOverride).toBe("Custom");
	});

	it("pins a pane", () => {
		const store = makeStore();
		store.getState().addTab({ id: "t1", panes: [tp("p1")] });

		store.getState().setPanePinned({
			tabId: "t1",
			paneId: "p1",
			pinned: true,
		});

		expect(store.getState().getPane("p1")?.pane.pinned).toBe(true);
	});

	it("replaces an unpinned pane with a new pane", () => {
		const store = makeStore();
		store.getState().addTab({
			id: "t1",
			panes: [{ ...tp("p1", "old"), pinned: false }],
			activePaneId: "p1",
		});

		store.getState().replacePane({
			tabId: "t1",
			paneId: "p1",
			newPane: tp("p2", "new"),
		});

		const tab = store.getState().tabs[0];
		expect(tab).toBeDefined();
		expect(tab?.panes.p1).toBeUndefined();
		expect(tab?.panes.p2?.data.label).toBe("new");
		expect(tab?.activePaneId).toBe("p2");
		expect(tab?.layout?.type === "pane" ? tab.layout.paneId : null).toBe("p2");
	});

	it("replacePane is no-op if target pane is pinned", () => {
		const store = makeStore();
		store.getState().addTab({
			id: "t1",
			panes: [{ ...tp("p1"), pinned: true }],
		});

		const before = structuredClone({
			version: store.getState().version,
			tabs: store.getState().tabs,
			activeTabId: store.getState().activeTabId,
		});
		store.getState().replacePane({
			tabId: "t1",
			paneId: "p1",
			newPane: tp("p2"),
		});

		expect({
			version: store.getState().version,
			tabs: store.getState().tabs,
			activeTabId: store.getState().activeTabId,
		}).toEqual(before);
	});
});

describe("split operations", () => {
	it("splits a single pane into a split with weights [1, 1]", () => {
		const store = makeStore();
		store.getState().addTab({ id: "t1", panes: [tp("p1")] });

		store.getState().splitPane({
			tabId: "t1",
			paneId: "p1",
			position: "right",
			newPane: tp("p2"),
		});

		const layout = store.getState().tabs[0]?.layout;
		expect(layout?.type).toBe("split");
		if (layout?.type === "split") {
			expect(layout.direction).toBe("horizontal");
			expect(layout.weights).toEqual([1, 1]);
			expect(layout.children).toHaveLength(2);
			expect(layout.children[0]).toEqual({ type: "pane", paneId: "p1" });
			expect(layout.children[1]).toEqual({ type: "pane", paneId: "p2" });
		}
	});

	it("split left puts new pane first", () => {
		const store = makeStore();
		store.getState().addTab({ id: "t1", panes: [tp("p1")] });

		store.getState().splitPane({
			tabId: "t1",
			paneId: "p1",
			position: "left",
			newPane: tp("p2"),
		});

		const layout = store.getState().tabs[0]?.layout;
		if (layout?.type === "split") {
			expect(layout.direction).toBe("horizontal");
			expect(layout.children[0]).toEqual({ type: "pane", paneId: "p2" });
			expect(layout.children[1]).toEqual({ type: "pane", paneId: "p1" });
		}
	});

	it("split top/bottom uses vertical direction", () => {
		const store = makeStore();
		store.getState().addTab({ id: "t1", panes: [tp("p1")] });

		store.getState().splitPane({
			tabId: "t1",
			paneId: "p1",
			position: "bottom",
			newPane: tp("p2"),
		});

		const layout = store.getState().tabs[0]?.layout;
		if (layout?.type === "split") {
			expect(layout.direction).toBe("vertical");
			expect(layout.children[0]).toEqual({ type: "pane", paneId: "p1" });
			expect(layout.children[1]).toEqual({ type: "pane", paneId: "p2" });
		}
	});

	it("split within same-direction split halves target weight and inserts adjacent", () => {
		const store = makeStore({
			version: 1,
			tabs: [
				{
					id: "t1",
					createdAt: Date.now(),
					activePaneId: "p1",
					layout: {
						type: "split",
						id: "s1",
						direction: "horizontal",
						children: [
							{ type: "pane", paneId: "p1" },
							{ type: "pane", paneId: "p2" },
							{ type: "pane", paneId: "p3" },
						],
						weights: [3, 2, 1],
					},
					panes: {
						p1: { id: "p1", kind: "test", data: { label: "p1" } },
						p2: { id: "p2", kind: "test", data: { label: "p2" } },
						p3: { id: "p3", kind: "test", data: { label: "p3" } },
					},
				},
			],
			activeTabId: "t1",
		});

		store.getState().splitPane({
			tabId: "t1",
			paneId: "p2",
			position: "right",
			newPane: tp("p4"),
		});

		const layout = store.getState().tabs[0]?.layout;
		if (layout?.type === "split") {
			expect(layout.weights).toEqual([3, 1, 1, 1]);
			expect(layout.children).toHaveLength(4);
			expect(layout.children[2]).toEqual({ type: "pane", paneId: "p4" });
		}
	});

	it("split with custom weights", () => {
		const store = makeStore();
		store.getState().addTab({ id: "t1", panes: [tp("p1")] });

		store.getState().splitPane({
			tabId: "t1",
			paneId: "p1",
			position: "right",
			newPane: tp("p2"),
			weights: [3, 1],
		});

		const layout = store.getState().tabs[0]?.layout;
		if (layout?.type === "split") {
			expect(layout.weights).toEqual([3, 1]);
		}
	});

	it("split with selectNewPane: false preserves focus", () => {
		const store = makeStore();
		store.getState().addTab({
			id: "t1",
			panes: [tp("p1")],
			activePaneId: "p1",
		});

		store.getState().splitPane({
			tabId: "t1",
			paneId: "p1",
			position: "right",
			newPane: tp("p2"),
			selectNewPane: false,
		});

		expect(store.getState().tabs[0]?.activePaneId).toBe("p1");
	});

	it("resizes a split", () => {
		const store = makeStore({
			version: 1,
			tabs: [
				{
					id: "t1",
					createdAt: Date.now(),
					activePaneId: "p1",
					layout: {
						type: "split",
						id: "s1",
						direction: "horizontal",
						children: [
							{ type: "pane", paneId: "p1" },
							{ type: "pane", paneId: "p2" },
						],
						weights: [1, 1],
					},
					panes: {
						p1: { id: "p1", kind: "test", data: { label: "p1" } },
						p2: { id: "p2", kind: "test", data: { label: "p2" } },
					},
				},
			],
			activeTabId: "t1",
		});

		store.getState().resizeSplit({
			tabId: "t1",
			splitId: "s1",
			weights: [3, 7],
		});

		const layout = store.getState().tabs[0]?.layout;
		if (layout?.type === "split") {
			expect(layout.weights).toEqual([3, 7]);
		}
	});

	it("equalizes a split — all weights become 1", () => {
		const store = makeStore({
			version: 1,
			tabs: [
				{
					id: "t1",
					createdAt: Date.now(),
					activePaneId: "p1",
					layout: {
						type: "split",
						id: "s1",
						direction: "horizontal",
						children: [
							{ type: "pane", paneId: "p1" },
							{ type: "pane", paneId: "p2" },
							{ type: "pane", paneId: "p3" },
						],
						weights: [10, 30, 60],
					},
					panes: {
						p1: { id: "p1", kind: "test", data: { label: "p1" } },
						p2: { id: "p2", kind: "test", data: { label: "p2" } },
						p3: { id: "p3", kind: "test", data: { label: "p3" } },
					},
				},
			],
			activeTabId: "t1",
		});

		store.getState().equalizeSplit({ tabId: "t1", splitId: "s1" });

		const layout = store.getState().tabs[0]?.layout;
		if (layout?.type === "split") {
			expect(layout.weights).toEqual([1, 1, 1]);
		}
	});
});

describe("collapsing", () => {
	it("close pane in 2-pane split collapses to remaining leaf", () => {
		const store = makeStore({
			version: 1,
			tabs: [
				{
					id: "t1",
					createdAt: Date.now(),
					activePaneId: "p1",
					layout: {
						type: "split",
						id: "s1",
						direction: "horizontal",
						children: [
							{ type: "pane", paneId: "p1" },
							{ type: "pane", paneId: "p2" },
						],
						weights: [1, 1],
					},
					panes: {
						p1: { id: "p1", kind: "test", data: { label: "p1" } },
						p2: { id: "p2", kind: "test", data: { label: "p2" } },
					},
				},
			],
			activeTabId: "t1",
		});

		store.getState().closePane({ tabId: "t1", paneId: "p1" });

		const tab = store.getState().tabs[0];
		expect(tab).toBeDefined();
		expect(tab?.layout).toEqual({ type: "pane", paneId: "p2" });
		expect(tab?.activePaneId).toBe("p2");
		expect(tab?.panes.p1).toBeUndefined();
	});

	it("close pane in 3-pane split removes child + weight", () => {
		const store = makeStore({
			version: 1,
			tabs: [
				{
					id: "t1",
					createdAt: Date.now(),
					activePaneId: "p2",
					layout: {
						type: "split",
						id: "s1",
						direction: "horizontal",
						children: [
							{ type: "pane", paneId: "p1" },
							{ type: "pane", paneId: "p2" },
							{ type: "pane", paneId: "p3" },
						],
						weights: [3, 2, 1],
					},
					panes: {
						p1: { id: "p1", kind: "test", data: { label: "p1" } },
						p2: { id: "p2", kind: "test", data: { label: "p2" } },
						p3: { id: "p3", kind: "test", data: { label: "p3" } },
					},
				},
			],
			activeTabId: "t1",
		});

		store.getState().closePane({ tabId: "t1", paneId: "p2" });

		const layout = store.getState().tabs[0]?.layout;
		if (layout?.type === "split") {
			expect(layout.children).toHaveLength(2);
			expect(layout.weights).toEqual([3, 1]);
		}
	});

	it("close last pane in tab removes the tab entirely", () => {
		const store = makeStore();
		store.getState().addTab({ id: "t1", panes: [tp("p1")] });

		store.getState().closePane({ tabId: "t1", paneId: "p1" });

		expect(store.getState().tabs).toHaveLength(0);
		expect(store.getState().activeTabId).toBeNull();
	});

	it("activePaneId falls back to sibling after close", () => {
		const store = makeStore({
			version: 1,
			tabs: [
				{
					id: "t1",
					createdAt: Date.now(),
					activePaneId: "p1",
					layout: {
						type: "split",
						id: "s1",
						direction: "horizontal",
						children: [
							{ type: "pane", paneId: "p1" },
							{ type: "pane", paneId: "p2" },
						],
						weights: [1, 1],
					},
					panes: {
						p1: { id: "p1", kind: "test", data: { label: "p1" } },
						p2: { id: "p2", kind: "test", data: { label: "p2" } },
					},
				},
			],
			activeTabId: "t1",
		});

		store.getState().closePane({ tabId: "t1", paneId: "p1" });
		expect(store.getState().tabs[0]?.activePaneId).toBe("p2");
	});
});

describe("openPane", () => {
	it("creates a new tab when no tabs exist", () => {
		const store = makeStore();

		store.getState().openPane({
			pane: tp("p1", "opened"),
			tabTitle: "My Tab",
		});

		expect(store.getState().tabs).toHaveLength(1);
		expect(store.getState().tabs[0]?.titleOverride).toBe("My Tab");
		expect(store.getState().getActivePane()?.pane.data.label).toBe("opened");
	});

	it("replaces an unpinned pane of the same kind", () => {
		const store = makeStore();
		store.getState().addTab({
			id: "t1",
			panes: [{ ...tp("p1", "old"), pinned: false }],
		});

		store.getState().openPane({ pane: tp("p2", "new") });

		const tab = store.getState().tabs[0];
		expect(tab?.panes.p1).toBeUndefined();
		expect(
			Object.values(tab?.panes ?? {}).some((p) => p.data.label === "new"),
		).toBe(true);
	});

	it("splits the active pane right when no unpinned match", () => {
		const store = makeStore();
		store.getState().addTab({
			id: "t1",
			panes: [{ ...tp("p1", "pinned"), pinned: true }],
		});

		store.getState().openPane({ pane: tp("p2", "split") });

		const layout = store.getState().tabs[0]?.layout;
		expect(layout?.type).toBe("split");
		if (layout?.type === "split") {
			expect(layout.children).toHaveLength(2);
		}
	});
});

describe("movePaneToSplit", () => {
	it("moves a pane within the same tab", () => {
		const store = makeStore({
			version: 1,
			tabs: [
				{
					id: "t1",
					createdAt: Date.now(),
					activePaneId: "p1",
					layout: {
						type: "split",
						id: "s1",
						direction: "horizontal",
						children: [
							{ type: "pane", paneId: "p1" },
							{ type: "pane", paneId: "p2" },
						],
						weights: [1, 1],
					},
					panes: {
						p1: { id: "p1", kind: "test", data: { label: "p1" } },
						p2: { id: "p2", kind: "test", data: { label: "p2" } },
					},
				},
			],
			activeTabId: "t1",
		});

		store.getState().movePaneToSplit({
			sourcePaneId: "p1",
			targetPaneId: "p2",
			position: "bottom",
		});

		const tab = store.getState().tabs[0];
		expect(tab).toBeDefined();
		// p1 should now be split below p2
		expect(tab?.panes.p1).toBeDefined();
		expect(tab?.panes.p2).toBeDefined();
		expect(tab?.activePaneId).toBe("p1");
	});

	it("moves a pane across tabs", () => {
		const store = makeStore({
			version: 1,
			tabs: [
				{
					id: "t1",
					createdAt: Date.now(),
					activePaneId: "p1",
					layout: {
						type: "split",
						id: "s1",
						direction: "horizontal",
						children: [
							{ type: "pane", paneId: "p1" },
							{ type: "pane", paneId: "p2" },
						],
						weights: [1, 1],
					},
					panes: {
						p1: { id: "p1", kind: "test", data: { label: "p1" } },
						p2: { id: "p2", kind: "test", data: { label: "p2" } },
					},
				},
				{
					id: "t2",
					createdAt: Date.now(),
					activePaneId: "p3",
					layout: { type: "pane", paneId: "p3" },
					panes: {
						p3: { id: "p3", kind: "test", data: { label: "p3" } },
					},
				},
			],
			activeTabId: "t1",
		});

		store.getState().movePaneToSplit({
			sourcePaneId: "p1",
			targetPaneId: "p3",
			position: "right",
		});

		// Source tab should have p2 only
		const t1 = store.getState().tabs.find((t) => t.id === "t1");
		expect(t1?.panes.p1).toBeUndefined();
		expect(t1?.layout).toEqual({ type: "pane", paneId: "p2" });

		// Target tab should have p3 + p1
		const t2 = store.getState().tabs.find((t) => t.id === "t2");
		expect(t2?.panes.p1).toBeDefined();
		expect(t2?.panes.p3).toBeDefined();
		expect(t2?.activePaneId).toBe("p1");
		expect(store.getState().activeTabId).toBe("t2");
	});

	it("removes source tab when last pane is moved out", () => {
		const store = makeStore();
		store.getState().addTab({ id: "t1", panes: [tp("p1")] });
		store.getState().addTab({ id: "t2", panes: [tp("p2")] });

		const tab1 = store.getState().tabs[0] as Tab<TestData>;
		const tab2 = store.getState().tabs[1] as Tab<TestData>;
		const p1Id = Object.keys(tab1.panes)[0] as string;
		const p2Id = Object.keys(tab2.panes)[0] as string;

		store.getState().movePaneToSplit({
			sourcePaneId: p1Id,
			targetPaneId: p2Id,
			position: "right",
		});

		expect(store.getState().tabs).toHaveLength(1);
	});

	it("is a no-op when dropping on self", () => {
		const store = makeStore();
		store.getState().addTab({ id: "t1", panes: [tp("p1")] });

		const tab0 = store.getState().tabs[0] as Tab<TestData>;
		const p1Id = Object.keys(tab0.panes)[0] as string;
		const before = structuredClone({
			version: store.getState().version,
			tabs: store.getState().tabs,
			activeTabId: store.getState().activeTabId,
		});

		store.getState().movePaneToSplit({
			sourcePaneId: p1Id,
			targetPaneId: p1Id,
			position: "right",
		});

		expect({
			version: store.getState().version,
			tabs: store.getState().tabs,
			activeTabId: store.getState().activeTabId,
		}).toEqual(before);
	});
});

describe("edge cases", () => {
	it("invalid IDs are no-ops", () => {
		const store = makeStore();
		store.getState().addTab({ id: "t1", panes: [tp("p1")] });

		const before = structuredClone({
			version: store.getState().version,
			tabs: store.getState().tabs,
			activeTabId: store.getState().activeTabId,
		});

		store.getState().setActiveTab("missing");
		store.getState().setActivePane({ tabId: "t1", paneId: "missing" });
		store.getState().closePane({ tabId: "t1", paneId: "missing" });
		store.getState().resizeSplit({
			tabId: "t1",
			splitId: "missing",
			weights: [1],
		});

		expect({
			version: store.getState().version,
			tabs: store.getState().tabs,
			activeTabId: store.getState().activeTabId,
		}).toEqual(before);
	});

	it("replaces state wholesale", () => {
		const store = makeStore();

		store.getState().replaceState((prev: WorkspaceState<TestData>) => ({
			...prev,
			activeTabId: "injected",
		}));

		expect(store.getState().activeTabId).toBe("injected");
	});
});

describe("reorderTab", () => {
	it("moves a tab forward", () => {
		const store = makeStore();
		store.getState().addTab({ id: "t1", panes: [tp("p1")] });
		store.getState().addTab({ id: "t2", panes: [tp("p2")] });
		store.getState().addTab({ id: "t3", panes: [tp("p3")] });

		store.getState().reorderTab({ tabId: "t1", toIndex: 2 });

		expect(store.getState().tabs.map((t) => t.id)).toEqual(["t2", "t3", "t1"]);
	});

	it("moves a tab backward", () => {
		const store = makeStore();
		store.getState().addTab({ id: "t1", panes: [tp("p1")] });
		store.getState().addTab({ id: "t2", panes: [tp("p2")] });
		store.getState().addTab({ id: "t3", panes: [tp("p3")] });

		store.getState().reorderTab({ tabId: "t3", toIndex: 0 });

		expect(store.getState().tabs.map((t) => t.id)).toEqual(["t3", "t1", "t2"]);
	});

	it("is a no-op when moving to same index", () => {
		const store = makeStore();
		store.getState().addTab({ id: "t1", panes: [tp("p1")] });
		store.getState().addTab({ id: "t2", panes: [tp("p2")] });

		const before = store.getState().tabs.map((t) => t.id);
		store.getState().reorderTab({ tabId: "t1", toIndex: 0 });

		expect(store.getState().tabs.map((t) => t.id)).toEqual(before);
	});

	it("is a no-op for unknown tabId", () => {
		const store = makeStore();
		store.getState().addTab({ id: "t1", panes: [tp("p1")] });

		const before = store.getState().tabs.map((t) => t.id);
		store.getState().reorderTab({ tabId: "missing", toIndex: 0 });

		expect(store.getState().tabs.map((t) => t.id)).toEqual(before);
	});

	it("clamps toIndex to valid range", () => {
		const store = makeStore();
		store.getState().addTab({ id: "t1", panes: [tp("p1")] });
		store.getState().addTab({ id: "t2", panes: [tp("p2")] });

		store.getState().reorderTab({ tabId: "t1", toIndex: 100 });

		expect(store.getState().tabs.map((t) => t.id)).toEqual(["t2", "t1"]);
	});

	it("preserves activeTabId", () => {
		const store = makeStore();
		store.getState().addTab({ id: "t1", panes: [tp("p1")] });
		store.getState().addTab({ id: "t2", panes: [tp("p2")] });
		store.getState().setActiveTab("t2");

		store.getState().reorderTab({ tabId: "t1", toIndex: 1 });

		expect(store.getState().activeTabId).toBe("t2");
	});
});
