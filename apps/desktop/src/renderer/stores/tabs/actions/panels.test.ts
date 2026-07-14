import { describe, expect, it } from "bun:test";
import type { MosaicNode, MosaicParent } from "react-mosaic-component";
import type { Tab, TabsState } from "../types";
import {
	deriveWorkspacePanels,
	moveTabToPanel,
	resolveNewTabPanelId,
	splitPanelWithTab,
} from "./panels";

const WORKSPACE_ID = "ws-1";

function createTab(
	id: string,
	options: { panelId?: string; workspaceId?: string } = {},
): Tab {
	return {
		id,
		name: id,
		workspaceId: options.workspaceId ?? WORKSPACE_ID,
		layout: `pane-${id}`,
		createdAt: 0,
		panelId: options.panelId,
	};
}

function createState(overrides: Partial<TabsState> = {}): TabsState {
	return {
		tabs: [],
		panes: {},
		activeTabIds: {},
		focusedPaneIds: {},
		tabHistoryStacks: {},
		closedTabsStack: [],
		panelLayouts: {},
		panelActiveTabIds: {},
		...overrides,
	};
}

const twoPanelLayout: MosaicNode<string> = {
	direction: "row",
	first: "panel-a",
	second: "panel-b",
	splitPercentage: 50,
};

describe("deriveWorkspacePanels", () => {
	it("returns empty state for a workspace without tabs", () => {
		const derived = deriveWorkspacePanels(createState(), WORKSPACE_ID);
		expect(derived.layout).toBeNull();
		expect(derived.panelIds).toEqual([]);
		expect(derived.focusedPanelId).toBeNull();
	});

	it("synthesizes a single implicit panel when no layout is stored", () => {
		const state = createState({
			tabs: [createTab("tab-1"), createTab("tab-2")],
			activeTabIds: { [WORKSPACE_ID]: "tab-2" },
		});

		const derived = deriveWorkspacePanels(state, WORKSPACE_ID);
		expect(derived.panelIds).toHaveLength(1);
		const panelId = derived.panelIds[0];
		expect(derived.layout).toBe(panelId);
		expect(derived.tabIdsByPanel[panelId]).toEqual(["tab-1", "tab-2"]);
		expect(derived.activeTabIdByPanel[panelId]).toBe("tab-2");
		expect(derived.focusedPanelId).toBe(panelId);
	});

	it("assigns tabs with unknown panelId to the first panel", () => {
		const state = createState({
			tabs: [
				createTab("tab-1", { panelId: "panel-a" }),
				createTab("tab-2", { panelId: "panel-gone" }),
				createTab("tab-3", { panelId: "panel-b" }),
			],
			panelLayouts: { [WORKSPACE_ID]: twoPanelLayout },
			activeTabIds: { [WORKSPACE_ID]: "tab-1" },
		});

		const derived = deriveWorkspacePanels(state, WORKSPACE_ID);
		expect(derived.tabIdsByPanel["panel-a"]).toEqual(["tab-1", "tab-2"]);
		expect(derived.tabIdsByPanel["panel-b"]).toEqual(["tab-3"]);
	});

	it("prunes panels that have no tabs from the layout", () => {
		const state = createState({
			tabs: [createTab("tab-1", { panelId: "panel-b" })],
			panelLayouts: { [WORKSPACE_ID]: twoPanelLayout },
			activeTabIds: { [WORKSPACE_ID]: "tab-1" },
		});

		const derived = deriveWorkspacePanels(state, WORKSPACE_ID);
		expect(derived.layout).toBe("panel-b");
		expect(derived.panelIds).toEqual(["panel-b"]);
		expect(derived.tabIdsByPanel["panel-a"]).toBeUndefined();
	});

	it("keeps the workspace active tab visible in its panel", () => {
		const state = createState({
			tabs: [
				createTab("tab-1", { panelId: "panel-a" }),
				createTab("tab-2", { panelId: "panel-a" }),
				createTab("tab-3", { panelId: "panel-b" }),
			],
			panelLayouts: { [WORKSPACE_ID]: twoPanelLayout },
			// Stale record points at tab-1 but the workspace active tab is tab-2
			panelActiveTabIds: { "panel-a": "tab-1", "panel-b": "tab-3" },
			activeTabIds: { [WORKSPACE_ID]: "tab-2" },
		});

		const derived = deriveWorkspacePanels(state, WORKSPACE_ID);
		expect(derived.focusedPanelId).toBe("panel-a");
		expect(derived.activeTabIdByPanel["panel-a"]).toBe("tab-2");
		expect(derived.activeTabIdByPanel["panel-b"]).toBe("tab-3");
	});

	it("falls back to the first member when a panel's record is stale", () => {
		const state = createState({
			tabs: [
				createTab("tab-1", { panelId: "panel-a" }),
				createTab("tab-2", { panelId: "panel-b" }),
				createTab("tab-3", { panelId: "panel-b" }),
			],
			panelLayouts: { [WORKSPACE_ID]: twoPanelLayout },
			panelActiveTabIds: { "panel-b": "tab-999" },
			activeTabIds: { [WORKSPACE_ID]: "tab-1" },
		});

		const derived = deriveWorkspacePanels(state, WORKSPACE_ID);
		expect(derived.activeTabIdByPanel["panel-b"]).toBe("tab-2");
	});

	it("resolveNewTabPanelId returns the focused panel", () => {
		const state = createState({
			tabs: [
				createTab("tab-1", { panelId: "panel-a" }),
				createTab("tab-2", { panelId: "panel-b" }),
			],
			panelLayouts: { [WORKSPACE_ID]: twoPanelLayout },
			activeTabIds: { [WORKSPACE_ID]: "tab-2" },
		});

		expect(resolveNewTabPanelId(state, WORKSPACE_ID)).toBe("panel-b");
	});
});

describe("moveTabToPanel", () => {
	const baseState = () =>
		createState({
			tabs: [
				createTab("tab-1", { panelId: "panel-a" }),
				createTab("tab-2", { panelId: "panel-a" }),
				createTab("tab-3", { panelId: "panel-b" }),
			],
			panelLayouts: { [WORKSPACE_ID]: twoPanelLayout },
			panelActiveTabIds: { "panel-a": "tab-1", "panel-b": "tab-3" },
			activeTabIds: { [WORKSPACE_ID]: "tab-1" },
			tabHistoryStacks: { [WORKSPACE_ID]: [] },
		});

	it("moves a tab into another panel and activates it", () => {
		const result = moveTabToPanel(baseState(), "tab-1", "panel-b");
		expect(result).not.toBeNull();
		if (!result) return;

		const moved = result.tabs.find((t) => t.id === "tab-1");
		expect(moved?.panelId).toBe("panel-b");
		// Appended after panel-b's existing tabs
		expect(result.tabs.map((t) => t.id)).toEqual(["tab-2", "tab-3", "tab-1"]);
		expect(result.panelActiveTabIds["panel-b"]).toBe("tab-1");
		// Source panel falls back to its remaining tab
		expect(result.panelActiveTabIds["panel-a"]).toBe("tab-2");
		expect(result.activeTabIds[WORKSPACE_ID]).toBe("tab-1");
		// Both panels still have tabs, so the layout is unchanged
		expect(result.panelLayouts[WORKSPACE_ID]).toEqual(twoPanelLayout);
	});

	it("inserts at the requested index within the target panel", () => {
		const result = moveTabToPanel(baseState(), "tab-3", "panel-a", 1);
		expect(result).not.toBeNull();
		if (!result) return;

		expect(result.tabs.map((t) => t.id)).toEqual(["tab-1", "tab-3", "tab-2"]);
		expect(result.tabs.find((t) => t.id === "tab-3")?.panelId).toBe("panel-a");
	});

	it("collapses the source panel when its last tab moves out", () => {
		const result = moveTabToPanel(baseState(), "tab-3", "panel-a");
		expect(result).not.toBeNull();
		if (!result) return;

		expect(result.panelLayouts[WORKSPACE_ID]).toBe("panel-a");
		expect(result.panelActiveTabIds["panel-b"]).toBeUndefined();
	});

	it("reorders within the same panel without touching activation", () => {
		const state = baseState();
		const result = moveTabToPanel(state, "tab-2", "panel-a", 0);
		expect(result).not.toBeNull();
		if (!result) return;

		expect(result.tabs.map((t) => t.id)).toEqual(["tab-2", "tab-1", "tab-3"]);
		expect(result.activeTabIds).toBe(state.activeTabIds);
		expect(result.panelActiveTabIds).toBe(state.panelActiveTabIds);
	});

	it("returns null for a same-panel move without an index", () => {
		expect(moveTabToPanel(baseState(), "tab-2", "panel-a")).toBeNull();
	});

	it("returns null when the target panel does not exist", () => {
		expect(moveTabToPanel(baseState(), "tab-1", "panel-nope")).toBeNull();
	});
});

describe("splitPanelWithTab", () => {
	const baseState = () =>
		createState({
			tabs: [
				createTab("tab-1", { panelId: "panel-a" }),
				createTab("tab-2", { panelId: "panel-a" }),
			],
			panelLayouts: { [WORKSPACE_ID]: "panel-a" },
			panelActiveTabIds: { "panel-a": "tab-1" },
			activeTabIds: { [WORKSPACE_ID]: "tab-1" },
			tabHistoryStacks: { [WORKSPACE_ID]: [] },
		});

	it("creates a new panel to the right and moves the tab into it", () => {
		const result = splitPanelWithTab(baseState(), "tab-2", "panel-a", "right");
		expect(result).not.toBeNull();
		if (!result) return;

		const layout = result.panelLayouts[WORKSPACE_ID] as MosaicParent<string>;
		expect(layout.direction).toBe("row");
		expect(layout.first).toBe("panel-a");
		const newPanelId = layout.second as string;
		expect(newPanelId).not.toBe("panel-a");

		expect(result.tabs.find((t) => t.id === "tab-2")?.panelId).toBe(newPanelId);
		expect(result.panelActiveTabIds[newPanelId]).toBe("tab-2");
		expect(result.panelActiveTabIds["panel-a"]).toBe("tab-1");
		expect(result.activeTabIds[WORKSPACE_ID]).toBe("tab-2");
	});

	it("places the new panel first for top/left positions", () => {
		const result = splitPanelWithTab(baseState(), "tab-2", "panel-a", "top");
		expect(result).not.toBeNull();
		if (!result) return;

		const layout = result.panelLayouts[WORKSPACE_ID] as MosaicParent<string>;
		expect(layout.direction).toBe("column");
		expect(layout.second).toBe("panel-a");
	});

	it("collapses the source panel when its only tab splits another panel", () => {
		const state = createState({
			tabs: [
				createTab("tab-1", { panelId: "panel-a" }),
				createTab("tab-2", { panelId: "panel-b" }),
			],
			panelLayouts: { [WORKSPACE_ID]: twoPanelLayout },
			activeTabIds: { [WORKSPACE_ID]: "tab-1" },
		});

		const result = splitPanelWithTab(state, "tab-2", "panel-a", "bottom");
		expect(result).not.toBeNull();
		if (!result) return;

		const layout = result.panelLayouts[WORKSPACE_ID] as MosaicParent<string>;
		// panel-b collapsed; the tree is panel-a split with the new panel
		expect(layout.direction).toBe("column");
		expect(layout.first).toBe("panel-a");
		expect(typeof layout.second).toBe("string");
		expect(layout.second).not.toBe("panel-b");
	});

	it("returns null when splitting a panel with its own only tab", () => {
		const state = createState({
			tabs: [createTab("tab-1", { panelId: "panel-a" })],
			panelLayouts: { [WORKSPACE_ID]: "panel-a" },
			activeTabIds: { [WORKSPACE_ID]: "tab-1" },
		});

		expect(splitPanelWithTab(state, "tab-1", "panel-a", "right")).toBeNull();
	});
});
