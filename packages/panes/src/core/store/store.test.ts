import { describe, expect, it } from "bun:test";
import type { WorkspaceState } from "../../types";
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

	it("removes the active middle tab and selects the next tab", () => {
		const store = makeStore();
		store.getState().addTab({ id: "t1", panes: [tp("p1")] });
		store.getState().addTab({ id: "t2", panes: [tp("p2")] });
		store.getState().addTab({ id: "t3", panes: [tp("p3")] });
		store.getState().setActiveTab("t2");

		store.getState().removeTab("t2");

		expect(store.getState().tabs.map((t) => t.id)).toEqual(["t1", "t3"]);
		expect(store.getState().activeTabId).toBe("t3");
	});

	it("removes the active last tab and selects the previous tab", () => {
		const store = makeStore();
		store.getState().addTab({ id: "t1", panes: [tp("p1")] });
		store.getState().addTab({ id: "t2", panes: [tp("p2")] });
		store.getState().addTab({ id: "t3", panes: [tp("p3")] });
		store.getState().setActiveTab("t3");

		store.getState().removeTab("t3");

		expect(store.getState().tabs.map((t) => t.id)).toEqual(["t1", "t2"]);
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

		store.getState().setPanePinned({ paneId: "p1", pinned: true });

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
	it("splits a single pane into a binary split", () => {
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
			expect(layout.splitPercentage).toBeUndefined();
			expect(layout.first).toEqual({ type: "pane", paneId: "p1" });
			expect(layout.second).toEqual({ type: "pane", paneId: "p2" });
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
			expect(layout.first).toEqual({ type: "pane", paneId: "p2" });
			expect(layout.second).toEqual({ type: "pane", paneId: "p1" });
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
			expect(layout.first).toEqual({ type: "pane", paneId: "p1" });
			expect(layout.second).toEqual({ type: "pane", paneId: "p2" });
		}
	});

	it("split creates nested binary split (no flattening)", () => {
		const store = makeStore();
		store.getState().addTab({ id: "t1", panes: [tp("p1")] });
		store.getState().splitPane({
			tabId: "t1",
			paneId: "p1",
			position: "right",
			newPane: tp("p2"),
		});
		store.getState().splitPane({
			tabId: "t1",
			paneId: "p2",
			position: "right",
			newPane: tp("p3"),
		});

		const layout = store.getState().tabs[0]?.layout;
		if (layout?.type === "split") {
			expect(layout.first).toEqual({ type: "pane", paneId: "p1" });
			// p2 is now in a nested split with p3
			expect(layout.second.type).toBe("split");
			if (layout.second.type === "split") {
				expect(layout.second.first).toEqual({ type: "pane", paneId: "p2" });
				expect(layout.second.second).toEqual({ type: "pane", paneId: "p3" });
			}
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

	it("resizes a split via path", () => {
		const store = makeStore();
		store.getState().addTab({ id: "t1", panes: [tp("p1")] });
		store.getState().splitPane({
			tabId: "t1",
			paneId: "p1",
			position: "right",
			newPane: tp("p2"),
		});

		store.getState().resizeSplit({
			tabId: "t1",
			path: [],
			splitPercentage: 30,
		});

		const layout = store.getState().tabs[0]?.layout;
		if (layout?.type === "split") {
			expect(layout.splitPercentage).toBe(30);
		}
	});

	it("equalizes all splits in a tab by leaf count", () => {
		const store = makeStore();
		store.getState().addTab({ id: "t1", panes: [tp("p1")] });
		store.getState().splitPane({
			tabId: "t1",
			paneId: "p1",
			position: "right",
			newPane: tp("p2"),
		});
		store.getState().splitPane({
			tabId: "t1",
			paneId: "p2",
			position: "bottom",
			newPane: tp("p3"),
		});

		// Resize root to skewed
		store.getState().resizeSplit({
			tabId: "t1",
			path: [],
			splitPercentage: 80,
		});

		store.getState().equalizeTab({ tabId: "t1" });

		const layout = store.getState().tabs[0]?.layout;
		// Root: [p1, [p2, p3]] → 1 leaf vs 2 leaves → 33.33%
		if (layout?.type === "split") {
			expect(layout.splitPercentage).toBeCloseTo(33.33, 1);
			if (layout.second.type === "split") {
				expect(layout.second.splitPercentage).toBe(50);
			}
		}
	});
});

describe("collapsing", () => {
	it("close pane in 2-pane split — sibling promotion", () => {
		const store = makeStore();
		store.getState().addTab({ id: "t1", panes: [tp("p1")] });
		store.getState().splitPane({
			tabId: "t1",
			paneId: "p1",
			position: "right",
			newPane: tp("p2"),
		});

		store.getState().closePane({ tabId: "t1", paneId: "p1" });

		const tab = store.getState().tabs[0];
		expect(tab?.layout).toEqual({ type: "pane", paneId: "p2" });
		expect(tab?.activePaneId).toBe("p2");
		expect(tab?.panes.p1).toBeUndefined();
	});

	it("close pane in nested split — only sibling affected", () => {
		const store = makeStore();
		store.getState().addTab({ id: "t1", panes: [tp("p1")] });
		store.getState().splitPane({
			tabId: "t1",
			paneId: "p1",
			position: "right",
			newPane: tp("p2"),
		});
		store.getState().splitPane({
			tabId: "t1",
			paneId: "p2",
			position: "bottom",
			newPane: tp("p3"),
		});

		// Layout: [p1, [p2, p3]]
		// Close p3 → [p1, p2] (sibling promotion of p2)
		store.getState().closePane({ tabId: "t1", paneId: "p3" });

		const layout = store.getState().tabs[0]?.layout;
		if (layout?.type === "split") {
			expect(layout.first).toEqual({ type: "pane", paneId: "p1" });
			expect(layout.second).toEqual({ type: "pane", paneId: "p2" });
		}
	});

	it("close last pane in tab removes the tab entirely", () => {
		const store = makeStore();
		store.getState().addTab({ id: "t1", panes: [tp("p1")] });

		store.getState().closePane({ tabId: "t1", paneId: "p1" });

		expect(store.getState().tabs).toHaveLength(0);
		expect(store.getState().activeTabId).toBeNull();
	});

	it("close last pane in active middle tab selects the next tab", () => {
		const store = makeStore();
		store.getState().addTab({ id: "t1", panes: [tp("p1")] });
		store.getState().addTab({ id: "t2", panes: [tp("p2")] });
		store.getState().addTab({ id: "t3", panes: [tp("p3")] });
		store.getState().setActiveTab("t2");

		store.getState().closePane({ tabId: "t2", paneId: "p2" });

		expect(store.getState().tabs.map((t) => t.id)).toEqual(["t1", "t3"]);
		expect(store.getState().activeTabId).toBe("t3");
	});

	it("activePaneId falls back to sibling after close", () => {
		const store = makeStore();
		store.getState().addTab({ id: "t1", panes: [tp("p1")] });
		store.getState().splitPane({
			tabId: "t1",
			paneId: "p1",
			position: "right",
			newPane: tp("p2"),
		});
		// Make p1 active
		store.getState().setActivePane({ tabId: "t1", paneId: "p1" });

		store.getState().closePane({ tabId: "t1", paneId: "p1" });
		expect(store.getState().tabs[0]?.activePaneId).toBe("p2");
	});

	it("activePaneId selects the next pane in layout order after close", () => {
		const store = makeStore();
		store.getState().addTab({
			id: "t1",
			activePaneId: "p2",
			panes: [tp("p1"), tp("p2"), tp("p3")],
		});

		store.getState().closePane({ tabId: "t1", paneId: "p2" });

		expect(store.getState().tabs[0]?.activePaneId).toBe("p3");
	});
});

describe("openPane", () => {
	it("creates a new tab when no tabs exist", () => {
		const store = makeStore();

		store.getState().openPane({
			pane: tp("p1", "opened"),
		});

		expect(store.getState().tabs).toHaveLength(1);
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
	});
});

describe("movePaneToSplit", () => {
	it("moves a pane within the same tab", () => {
		const store = makeStore();
		store.getState().addTab({ id: "t1", panes: [tp("p1")] });
		store.getState().splitPane({
			tabId: "t1",
			paneId: "p1",
			position: "right",
			newPane: tp("p2"),
		});

		store.getState().movePaneToSplit({
			sourcePaneId: "p1",
			targetPaneId: "p2",
			position: "bottom",
		});

		const tab = store.getState().tabs[0];
		expect(tab?.panes.p1).toBeDefined();
		expect(tab?.panes.p2).toBeDefined();
		expect(tab?.activePaneId).toBe("p1");
	});

	it("moves a pane across tabs", () => {
		const store = makeStore();
		store.getState().addTab({ id: "t1", panes: [tp("p1")] });
		store.getState().splitPane({
			tabId: "t1",
			paneId: "p1",
			position: "right",
			newPane: tp("p2"),
		});
		store.getState().addTab({ id: "t2", panes: [tp("p3")] });

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

	it("is a no-op when dropping on self", () => {
		const store = makeStore();
		store.getState().addTab({ id: "t1", panes: [tp("p1")] });

		const before = structuredClone({
			version: store.getState().version,
			tabs: store.getState().tabs,
			activeTabId: store.getState().activeTabId,
		});

		store.getState().movePaneToSplit({
			sourcePaneId: "p1",
			targetPaneId: "p1",
			position: "right",
		});

		expect({
			version: store.getState().version,
			tabs: store.getState().tabs,
			activeTabId: store.getState().activeTabId,
		}).toEqual(before);
	});
});

describe("movePaneToNewTab", () => {
	it("moves a pane into a new tab at the requested index", () => {
		const store = makeStore();
		store.getState().addTab({
			id: "t1",
			panes: [tp("p1"), tp("p2")],
			activePaneId: "p1",
		});
		store.getState().addTab({ id: "t2", panes: [tp("p3")] });

		store.getState().movePaneToNewTab({ paneId: "p2", toIndex: 1 });

		const tabs = store.getState().tabs;
		const newTab = tabs[1];
		if (!newTab) throw new Error("Expected new tab at index 1");

		expect(tabs.map((t) => t.id)).toEqual(["t1", newTab.id, "t2"]);
		expect(newTab.panes.p2).toBeDefined();
		expect(newTab.activePaneId).toBe("p2");
		expect(newTab.layout).toEqual({ type: "pane", paneId: "p2" });
		expect(tabs[0]?.panes.p2).toBeUndefined();
		expect(tabs[0]?.layout).toEqual({ type: "pane", paneId: "p1" });
		expect(store.getState().activeTabId).toBe(newTab.id);
	});

	it("keeps insertion position stable when the source tab is removed", () => {
		const store = makeStore();
		store.getState().addTab({ id: "t1", panes: [tp("p1")] });
		store.getState().addTab({ id: "t2", panes: [tp("p2")] });

		store.getState().movePaneToNewTab({ paneId: "p1", toIndex: 1 });

		const tabs = store.getState().tabs;
		const newTab = tabs[0];
		if (!newTab) throw new Error("Expected new tab at index 0");

		expect(tabs.map((t) => t.id)).toEqual([newTab.id, "t2"]);
		expect(newTab.panes.p1).toBeDefined();
		expect(store.getState().activeTabId).toBe(newTab.id);
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

	it("clamps toIndex to valid range", () => {
		const store = makeStore();
		store.getState().addTab({ id: "t1", panes: [tp("p1")] });
		store.getState().addTab({ id: "t2", panes: [tp("p2")] });

		store.getState().reorderTab({ tabId: "t1", toIndex: 100 });

		expect(store.getState().tabs.map((t) => t.id)).toEqual(["t2", "t1"]);
	});
});
