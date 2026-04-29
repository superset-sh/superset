import { describe, expect, it } from "bun:test";
import type { MosaicNode } from "react-mosaic-component";
import { applyZoomMergeRules } from "./persist-merge";
import type { Tab, TabsState } from "./types";

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

function makeState(tabs: Tab[]): TabsState {
	return { tabs } as unknown as TabsState;
}

describe("applyZoomMergeRules", () => {
	it("on a tab quit while zoomed: restores layout from savedLayout, then clears zoom", () => {
		const persisted = makeState([
			makeTab({
				layout: "pane-a",
				zoom: { savedLayout: splitLayout, paneId: "pane-a" },
			}),
		]);
		const merged = applyZoomMergeRules(persisted);
		expect(merged.tabs[0].layout).toEqual(splitLayout);
		expect(merged.tabs[0].zoom).toBeUndefined();
	});

	it("on a non-zoomed tab: returns state unchanged for that tab", () => {
		const persisted = makeState([makeTab()]);
		const merged = applyZoomMergeRules(persisted);
		expect(merged.tabs[0].layout).toEqual(splitLayout);
		expect(merged.tabs[0].zoom).toBeUndefined();
	});

	it("on a single-pane tab with no zoom: layout untouched (string leaf legitimate)", () => {
		const persisted = makeState([makeTab({ layout: "pane-only" })]);
		const merged = applyZoomMergeRules(persisted);
		expect(merged.tabs[0].layout).toBe("pane-only");
		expect(merged.tabs[0].zoom).toBeUndefined();
	});

	it("on pre-PR persisted state without a zoom field: harmless no-op", () => {
		const tab = {
			id: "tab-1",
			workspaceId: "ws-1",
			name: "Tab 1",
			layout: splitLayout,
			createdAt: 0,
		};
		const persisted = makeState([tab as unknown as Tab]);
		const merged = applyZoomMergeRules(persisted);
		expect(merged.tabs[0].layout).toEqual(splitLayout);
		expect((merged.tabs[0] as Tab).zoom).toBeUndefined();
	});

	it("handles multiple tabs independently", () => {
		const persisted = makeState([
			makeTab({
				id: "tab-1",
				layout: "pane-a",
				zoom: { savedLayout: splitLayout, paneId: "pane-a" },
			}),
			makeTab({ id: "tab-2", layout: splitLayout }),
		]);
		const merged = applyZoomMergeRules(persisted);
		expect(merged.tabs[0].layout).toEqual(splitLayout);
		expect(merged.tabs[0].zoom).toBeUndefined();
		expect(merged.tabs[1].layout).toEqual(splitLayout);
		expect(merged.tabs[1].zoom).toBeUndefined();
	});
});
