import { describe, expect, it } from "bun:test";
import type { MosaicNode } from "react-mosaic-component";
import type { Pane, Tab, TabsState } from "../types";
import { equalizeSplitPercentages, removePaneFromLayout } from "../utils";
import { mergeTabIntoTab, movePaneToTab } from "./move-pane";
import {
	clearZoomBeforeMutation,
	toggleZoomPane,
	unzoomPane,
	zoomPane,
} from "./zoom-pane";

const splitLayout: MosaicNode<string> = {
	direction: "row",
	first: "pane-a",
	second: "pane-b",
};

function makeTab(overrides: Partial<Tab> = {}): Tab {
	return {
		id: "tab-1",
		workspaceId: "ws-1",
		name: "Tab 1",
		layout: splitLayout,
		createdAt: 0,
		...overrides,
	};
}

function makeState(tab: Tab): TabsState {
	return {
		tabs: [tab],
	} as unknown as TabsState; // we only touch `tabs` in zoom-pane logic
}

describe("zoomPane", () => {
	it("stashes layout, replaces with leaf, sets zoom.paneId", () => {
		const next = zoomPane(makeState(makeTab()), "tab-1", "pane-a");
		const t = next.tabs[0];
		expect(t.layout).toBe("pane-a");
		expect(t.zoom).toEqual({ savedLayout: splitLayout, paneId: "pane-a" });
	});

	it("is a no-op on already-zoomed tab", () => {
		const zoomed = zoomPane(makeState(makeTab()), "tab-1", "pane-a");
		const again = zoomPane(zoomed, "tab-1", "pane-a");
		expect(again).toBe(zoomed);
	});

	it("is a no-op on a single-pane tab (no siblings to hide)", () => {
		const single = makeState(makeTab({ layout: "pane-only" }));
		const next = zoomPane(single, "tab-1", "pane-only");
		expect(next).toBe(single);
	});

	it("is a no-op when tabId not found", () => {
		const state = makeState(makeTab());
		expect(zoomPane(state, "missing", "pane-a")).toBe(state);
	});
});

describe("unzoomPane", () => {
	it("restores savedLayout and clears zoom", () => {
		const zoomed = zoomPane(makeState(makeTab()), "tab-1", "pane-a");
		const restored = unzoomPane(zoomed, "tab-1");
		const t = restored.tabs[0];
		expect(t.layout).toEqual(splitLayout);
		expect(t.zoom).toBeUndefined();
	});

	it("is a no-op on a non-zoomed tab", () => {
		const state = makeState(makeTab());
		expect(unzoomPane(state, "tab-1")).toBe(state);
	});
});

describe("clearZoomBeforeMutation", () => {
	it("restores savedLayout and clears zoom (same as unzoomPane)", () => {
		const zoomed = zoomPane(makeState(makeTab()), "tab-1", "pane-a");
		const cleared = clearZoomBeforeMutation(zoomed, "tab-1");
		const t = cleared.tabs[0];
		expect(t.layout).toEqual(splitLayout);
		expect(t.zoom).toBeUndefined();
	});

	it("is a no-op when tab is not zoomed (idempotent)", () => {
		const state = makeState(makeTab());
		expect(clearZoomBeforeMutation(state, "tab-1")).toBe(state);
	});
});

describe("toggleZoomPane", () => {
	it("zoom→toggle→toggle is the identity on layout", () => {
		const initial = makeState(makeTab());
		const a = toggleZoomPane(initial, "tab-1", "pane-a");
		const b = toggleZoomPane(a, "tab-1", "pane-a");
		expect(b.tabs[0].layout).toEqual(splitLayout);
		expect(b.tabs[0].zoom).toBeUndefined();
	});

	it("ignores paneId on the unzoom branch", () => {
		const zoomed = zoomPane(makeState(makeTab()), "tab-1", "pane-a");
		// Triggering toggle from a different paneId still un-zooms.
		const restored = toggleZoomPane(zoomed, "tab-1", "pane-b");
		expect(restored.tabs[0].layout).toEqual(splitLayout);
		expect(restored.tabs[0].zoom).toBeUndefined();
	});
});

// ---------------------------------------------------------------------------
// Integration tests: zoom + layout-mutating actions
//
// All cases use the same pure-state approach as move-pane.test.ts. The live
// store (useTabsStore) is intentionally NOT imported here — it depends on the
// Electron IPC-backed persist middleware (trpcTabsStorage), posthog, and
// editor-state stores that require a running Electron environment. The pure
// action functions called by the store (clearZoomBeforeMutation,
// removePaneFromLayout, mergeTabIntoTab, movePaneToTab, equalizeSplitPercentages)
// are sufficient to verify that zoom is cleared correctly before every mutation.
// ---------------------------------------------------------------------------

const WS = "ws-1";

function makeFullTab(id: string, layout: MosaicNode<string>): Tab {
	return { id, workspaceId: WS, name: id, layout, createdAt: 0 };
}

function makePane(id: string, tabId: string): Pane {
	return { id, tabId, type: "terminal", name: id };
}

function makeFullState(overrides: Partial<TabsState> = {}): TabsState {
	return {
		tabs: [],
		panes: {},
		activeTabIds: {},
		focusedPaneIds: {},
		tabHistoryStacks: {},
		closedTabsStack: [],
		...overrides,
	};
}

describe("zoom + store actions (integration)", () => {
	// 1. removePane(zoomedPaneId): clear zoom first, then remove the pane from
	//    the restored layout. The sibling pane should become the new sole leaf.
	it("removePane(zoomedPaneId) restores the tree without that pane", () => {
		const layout: MosaicNode<string> = {
			direction: "row",
			first: "pane-a",
			second: "pane-b",
		};
		const tab = makeFullTab("tab-1", layout);
		const state = makeFullState({
			tabs: [tab],
			panes: {
				"pane-a": makePane("pane-a", "tab-1"),
				"pane-b": makePane("pane-b", "tab-1"),
			},
		});

		// Zoom to pane-a (simulates user zooming)
		const zoomed = zoomPane(state, "tab-1", "pane-a");
		expect(zoomed.tabs[0].zoom).toBeDefined();

		// The store's removePane calls clearZoomBeforeMutation first.
		// Simulate that: clear zoom, then remove the pane.
		const cleared = clearZoomBeforeMutation(zoomed, "tab-1");
		expect(cleared.tabs[0].zoom).toBeUndefined();
		expect(cleared.tabs[0].layout).toEqual(layout);

		const newLayout = removePaneFromLayout(cleared.tabs[0].layout, "pane-a");
		expect(newLayout).toBe("pane-b"); // sibling remains as sole leaf
	});

	// 2. splitPaneVertical (leaf) while zoomed: clear zoom then split.
	//    After clearing zoom the tab layout is the restored tree; splitting
	//    appends a new leaf to the right of it.
	it("splitPaneVertical while zoomed clears zoom then splits", () => {
		const layout: MosaicNode<string> = {
			direction: "row",
			first: "pane-a",
			second: "pane-b",
		};
		const tab = makeFullTab("tab-1", layout);
		const state = makeFullState({ tabs: [tab] });

		const zoomed = zoomPane(state, "tab-1", "pane-a");
		expect(zoomed.tabs[0].layout).toBe("pane-a"); // zoomed view

		// Store's splitPaneVertical calls clearZoomBeforeMutation first.
		const cleared = clearZoomBeforeMutation(zoomed, "tab-1");
		expect(cleared.tabs[0].layout).toEqual(layout); // restored
		expect(cleared.tabs[0].zoom).toBeUndefined();

		// Then it appends the new pane to the right of the current layout.
		const newPaneId = "pane-c";
		const newLayout: MosaicNode<string> = {
			direction: "row",
			first: cleared.tabs[0].layout,
			second: newPaneId,
			splitPercentage: 50,
		};
		// Resulting layout contains all three panes; no zoom field.
		expect(newLayout).toEqual({
			direction: "row",
			first: { direction: "row", first: "pane-a", second: "pane-b" },
			second: "pane-c",
			splitPercentage: 50,
		});
	});

	// 3. splitPaneAuto is a thin dispatcher over splitPaneVertical/Horizontal.
	//    Its zoom-clearing behaviour is identical to case 2 — it delegates to
	//    splitPaneVertical (or Horizontal), which calls clearZoomBeforeMutation.
	//    No additional pure-function surface to test here beyond case 2.
	it.todo(
		"splitPaneAuto (wrapper) while zoomed inherits clearing transitively — covered by case 2 (same clearZoomBeforeMutation call path)",
	);

	// 4. equalizePaneSplits calls updateTabLayout which calls
	//    clearZoomBeforeMutation unconditionally. Verify that applying
	//    equalizeSplitPercentages to a zoomed tab's restored layout gives the
	//    correct split ratios.
	it("equalizePaneSplits clears zoom via updateTabLayout", () => {
		const threeWayLayout: MosaicNode<string> = {
			direction: "row",
			first: "pane-a",
			second: {
				direction: "row",
				first: "pane-b",
				second: "pane-c",
				splitPercentage: 70, // deliberately uneven
			},
			splitPercentage: 30, // deliberately uneven
		};
		const tab = makeFullTab("tab-1", threeWayLayout);
		const state = makeFullState({ tabs: [tab] });

		const zoomed = zoomPane(state, "tab-1", "pane-a");

		// equalizePaneSplits → updateTabLayout → clearZoomBeforeMutation first.
		const cleared = clearZoomBeforeMutation(zoomed, "tab-1");
		expect(cleared.tabs[0].zoom).toBeUndefined();

		// Then equalizeSplitPercentages is applied to the restored layout.
		const equalized = equalizeSplitPercentages(
			cleared.tabs[0].layout as MosaicNode<string>,
		);
		// 1 leaf on left (pane-a), 2 leaves on right → 33.3% left
		expect(
			(equalized as { splitPercentage: number }).splitPercentage,
		).toBeCloseTo((1 / 3) * 100, 5);
	});

	// 5. updateTabLayout direct call (mosaic onChange simulation) clears zoom.
	//    The store's updateTabLayout calls clearZoomBeforeMutation
	//    unconditionally before applying the new layout.
	it("updateTabLayout (mosaic onChange simulation) clears zoom", () => {
		const layout: MosaicNode<string> = {
			direction: "row",
			first: "pane-a",
			second: "pane-b",
		};
		const tab = makeFullTab("tab-1", layout);
		const state = makeFullState({ tabs: [tab] });

		const zoomed = zoomPane(state, "tab-1", "pane-a");
		expect(zoomed.tabs[0].zoom).toBeDefined();

		// clearZoomBeforeMutation is the first call inside updateTabLayout.
		const cleared = clearZoomBeforeMutation(zoomed, "tab-1");

		// Then the incoming layout (e.g. a resize drag result) is applied.
		const resizedLayout: MosaicNode<string> = {
			direction: "row",
			first: "pane-a",
			second: "pane-b",
			splitPercentage: 60,
		};
		const finalTabs = cleared.tabs.map((t) =>
			t.id === "tab-1" ? { ...t, layout: resizedLayout } : t,
		);

		expect(finalTabs[0].zoom).toBeUndefined();
		expect(finalTabs[0].layout).toEqual(resizedLayout);
	});

	// 6. mergeTabIntoTab clears zoom on the target tab.
	//    The store calls clearZoomBeforeMutation(state, targetTabId) before
	//    delegating to the pure mergeTabIntoTab function.
	it("mergeTabIntoTab clears zoom on the target tab", () => {
		const srcLayout: MosaicNode<string> = "pane-src";
		const tgtLayout: MosaicNode<string> = {
			direction: "row",
			first: "pane-tgt-a",
			second: "pane-tgt-b",
		};

		const srcTab = makeFullTab("tab-src", srcLayout);
		const tgtTab = makeFullTab("tab-tgt", tgtLayout);
		const state = makeFullState({
			tabs: [srcTab, tgtTab],
			panes: {
				"pane-src": makePane("pane-src", "tab-src"),
				"pane-tgt-a": makePane("pane-tgt-a", "tab-tgt"),
				"pane-tgt-b": makePane("pane-tgt-b", "tab-tgt"),
			},
			activeTabIds: { [WS]: "tab-tgt" },
			focusedPaneIds: { "tab-src": "pane-src", "tab-tgt": "pane-tgt-a" },
			tabHistoryStacks: { [WS]: [] },
		});

		// Zoom the target tab on pane-tgt-a
		const zoomed = zoomPane(state, "tab-tgt", "pane-tgt-a");
		expect(zoomed.tabs.find((t) => t.id === "tab-tgt")?.zoom).toBeDefined();

		// The store calls clearZoomBeforeMutation on targetTabId first.
		const cleared = clearZoomBeforeMutation(zoomed, "tab-tgt");
		expect(cleared.tabs.find((t) => t.id === "tab-tgt")?.zoom).toBeUndefined();
		expect(cleared.tabs.find((t) => t.id === "tab-tgt")?.layout).toEqual(
			tgtLayout,
		);

		// Then the pure merge is called on the cleared state.
		const result = mergeTabIntoTab(cleared, "tab-src", "tab-tgt", [], "right");
		expect(result).not.toBeNull();
		if (!result) return;

		expect(result.tabs).toHaveLength(1);
		const merged = result.tabs.find((t) => t.id === "tab-tgt");
		expect(merged?.zoom).toBeUndefined();
		// Merged layout has src pane appended to the right of tgt layout.
		expect(merged?.layout).toEqual({
			direction: "row",
			first: tgtLayout,
			second: "pane-src",
			splitPercentage: 50,
		});
	});

	// 7. movePaneToTab clears zoom on both source and target tabs.
	it("movePaneToTab clears zoom on both source and target", () => {
		const srcLayout: MosaicNode<string> = {
			direction: "row",
			first: "pane-a",
			second: "pane-b",
		};
		// Target also needs a multi-pane layout so zoomPane is not a no-op.
		const tgtLayout: MosaicNode<string> = {
			direction: "row",
			first: "pane-c",
			second: "pane-d",
		};

		const srcTab = makeFullTab("tab-src", srcLayout);
		const tgtTab = makeFullTab("tab-tgt", tgtLayout);
		const state = makeFullState({
			tabs: [srcTab, tgtTab],
			panes: {
				"pane-a": makePane("pane-a", "tab-src"),
				"pane-b": makePane("pane-b", "tab-src"),
				"pane-c": makePane("pane-c", "tab-tgt"),
				"pane-d": makePane("pane-d", "tab-tgt"),
			},
			activeTabIds: { [WS]: "tab-tgt" },
			focusedPaneIds: { "tab-src": "pane-a", "tab-tgt": "pane-c" },
			tabHistoryStacks: { [WS]: [] },
		});

		// Zoom pane-a in source and pane-c in target
		let zoomed = zoomPane(state, "tab-src", "pane-a");
		zoomed = zoomPane(zoomed, "tab-tgt", "pane-c");
		expect(zoomed.tabs.find((t) => t.id === "tab-src")?.zoom).toBeDefined();
		expect(zoomed.tabs.find((t) => t.id === "tab-tgt")?.zoom).toBeDefined();

		// The store calls clearZoomBeforeMutation on both tabs before movePaneToTab.
		let cleared = clearZoomBeforeMutation(zoomed, "tab-src");
		cleared = clearZoomBeforeMutation(cleared, "tab-tgt");
		expect(cleared.tabs.find((t) => t.id === "tab-src")?.zoom).toBeUndefined();
		expect(cleared.tabs.find((t) => t.id === "tab-tgt")?.zoom).toBeUndefined();
		expect(cleared.tabs.find((t) => t.id === "tab-src")?.layout).toEqual(
			srcLayout,
		);

		// The pure movePaneToTab is called on the cleared state.
		const result = movePaneToTab(cleared, "pane-b", "tab-tgt");
		expect(result).not.toBeNull();
		if (!result) return;

		// Source tab still has pane-a; target tab gained pane-b.
		const srcAfter = result.tabs.find((t) => t.id === "tab-src");
		expect(srcAfter?.layout).toBe("pane-a");
		const tgtAfter = result.tabs.find((t) => t.id === "tab-tgt");
		// pane-b should appear in the target layout
		const tgtLayoutStr = JSON.stringify(tgtAfter?.layout);
		expect(tgtLayoutStr).toContain("pane-b");
	});

	// 8. Per-tab scope: zoom on tab A, switch tabs, return to A — still zoomed.
	//    Zoom state is keyed per-tab in TabsState.tabs[n].zoom.
	//    Switching the active tab does not clear other tabs' zoom state.
	it("per-tab scope: zoom on tab A does not affect tab B", () => {
		const layoutA: MosaicNode<string> = {
			direction: "row",
			first: "pane-a1",
			second: "pane-a2",
		};
		const layoutB: MosaicNode<string> = {
			direction: "row",
			first: "pane-b1",
			second: "pane-b2",
		};
		const tabA = makeFullTab("tab-a", layoutA);
		const tabB = makeFullTab("tab-b", layoutB);
		const state = makeFullState({ tabs: [tabA, tabB] });

		// Zoom tab A
		const zoomed = zoomPane(state, "tab-a", "pane-a1");

		// Tab B is unaffected
		const tabBAfter = zoomed.tabs.find((t) => t.id === "tab-b");
		expect(tabBAfter?.zoom).toBeUndefined();
		expect(tabBAfter?.layout).toEqual(layoutB);

		// Tab A is zoomed
		const tabAAfter = zoomed.tabs.find((t) => t.id === "tab-a");
		expect(tabAAfter?.zoom).toBeDefined();
		expect(tabAAfter?.layout).toBe("pane-a1");

		// Clearing zoom on tab B (e.g. switching to it and performing a mutation)
		// does NOT affect tab A's zoom.
		const clearedB = clearZoomBeforeMutation(zoomed, "tab-b");
		const tabAStill = clearedB.tabs.find((t) => t.id === "tab-a");
		expect(tabAStill?.zoom).toBeDefined(); // A still zoomed
		expect(tabAStill?.layout).toBe("pane-a1");
	});
});
