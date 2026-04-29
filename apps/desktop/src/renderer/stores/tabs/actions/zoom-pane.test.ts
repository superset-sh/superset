import { describe, expect, it } from "bun:test";
import type { MosaicNode } from "react-mosaic-component";
import type { Tab, TabsState } from "../types";
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
