import { describe, expect, it } from "bun:test";
import type { LayoutNode, Tab, WorkspaceState } from "../../../types";
import {
	buildExpandedPanelLayout,
	computePanelActiveSync,
	deriveWorkspacePanels,
	IMPLICIT_PANEL_ID,
	isPanelExpanded,
	moveTabToPanel,
	splitPanelWithTab,
} from "./panels";

type TestData = { label?: string };

function createTab(
	id: string,
	options: { panelId?: string } = {},
): Tab<TestData> {
	return {
		id,
		createdAt: 0,
		activePaneId: `pane-${id}`,
		layout: { type: "pane", paneId: `pane-${id}` },
		panes: {
			[`pane-${id}`]: { id: `pane-${id}`, kind: "test", data: {} },
		},
		panelId: options.panelId,
	};
}

function createState(
	overrides: Partial<WorkspaceState<TestData>> = {},
): WorkspaceState<TestData> {
	return {
		version: 1,
		tabs: [],
		activeTabId: null,
		panelLayout: null,
		panelActiveTabIds: {},
		...overrides,
	};
}

const panelNode = (panelId: string): LayoutNode => ({
	type: "pane",
	paneId: panelId,
});

const twoPanelLayout: LayoutNode = {
	type: "split",
	direction: "horizontal",
	first: panelNode("panel-a"),
	second: panelNode("panel-b"),
};

describe("deriveWorkspacePanels", () => {
	it("synthesizes a single implicit panel when no layout is stored", () => {
		const state = createState({
			tabs: [createTab("tab-1"), createTab("tab-2")],
			activeTabId: "tab-2",
		});

		const derived = deriveWorkspacePanels(state);
		expect(derived.panelIds).toEqual([IMPLICIT_PANEL_ID]);
		expect(derived.tabIdsByPanel[IMPLICIT_PANEL_ID]).toEqual([
			"tab-1",
			"tab-2",
		]);
		expect(derived.activeTabIdByPanel[IMPLICIT_PANEL_ID]).toBe("tab-2");
		expect(derived.focusedPanelId).toBe(IMPLICIT_PANEL_ID);
	});

	it("keeps a single empty implicit panel for a workspace without tabs", () => {
		const derived = deriveWorkspacePanels(createState());
		expect(derived.panelIds).toEqual([IMPLICIT_PANEL_ID]);
		expect(derived.activeTabIdByPanel[IMPLICIT_PANEL_ID]).toBeNull();
	});

	it("assigns tabs with unknown panelId to the first panel", () => {
		const state = createState({
			tabs: [
				createTab("tab-1", { panelId: "panel-a" }),
				createTab("tab-2", { panelId: "panel-gone" }),
				createTab("tab-3", { panelId: "panel-b" }),
			],
			panelLayout: twoPanelLayout,
			activeTabId: "tab-1",
		});

		const derived = deriveWorkspacePanels(state);
		expect(derived.tabIdsByPanel["panel-a"]).toEqual(["tab-1", "tab-2"]);
		expect(derived.tabIdsByPanel["panel-b"]).toEqual(["tab-3"]);
	});

	it("prunes panels without tabs from the layout", () => {
		const state = createState({
			tabs: [createTab("tab-1", { panelId: "panel-b" })],
			panelLayout: twoPanelLayout,
			activeTabId: "tab-1",
		});

		const derived = deriveWorkspacePanels(state);
		expect(derived.panelIds).toEqual(["panel-b"]);
	});

	it("keeps the workspace active tab visible over a stale record", () => {
		const state = createState({
			tabs: [
				createTab("tab-1", { panelId: "panel-a" }),
				createTab("tab-2", { panelId: "panel-a" }),
				createTab("tab-3", { panelId: "panel-b" }),
			],
			panelLayout: twoPanelLayout,
			panelActiveTabIds: { "panel-a": "tab-1", "panel-b": "tab-3" },
			activeTabId: "tab-2",
		});

		const derived = deriveWorkspacePanels(state);
		expect(derived.focusedPanelId).toBe("panel-a");
		expect(derived.activeTabIdByPanel["panel-a"]).toBe("tab-2");
		expect(derived.activeTabIdByPanel["panel-b"]).toBe("tab-3");
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
			panelLayout: twoPanelLayout,
			panelActiveTabIds: { "panel-a": "tab-1", "panel-b": "tab-3" },
			activeTabId: "tab-1",
		});

	it("moves a tab into another panel and activates it", () => {
		const result = moveTabToPanel(baseState(), {
			tabId: "tab-1",
			targetPanelId: "panel-b",
		});
		expect(result).not.toBeNull();
		if (!result) return;

		expect(result.tabs.map((t) => t.id)).toEqual(["tab-2", "tab-3", "tab-1"]);
		expect(result.tabs.find((t) => t.id === "tab-1")?.panelId).toBe("panel-b");
		expect(result.panelActiveTabIds["panel-b"]).toBe("tab-1");
		expect(result.panelActiveTabIds["panel-a"]).toBe("tab-2");
		expect(result.activeTabId).toBe("tab-1");
		expect(result.panelLayout).toEqual(twoPanelLayout);
	});

	it("collapses the source panel when its last tab moves out", () => {
		const result = moveTabToPanel(baseState(), {
			tabId: "tab-3",
			targetPanelId: "panel-a",
		});
		expect(result).not.toBeNull();
		if (!result) return;

		expect(result.panelLayout).toEqual(panelNode("panel-a"));
		expect(result.panelActiveTabIds["panel-b"]).toBeUndefined();
	});

	it("reorders within the same panel without touching activation", () => {
		const state = baseState();
		const result = moveTabToPanel(state, {
			tabId: "tab-2",
			targetPanelId: "panel-a",
			toIndex: 0,
		});
		expect(result).not.toBeNull();
		if (!result) return;

		expect(result.tabs.map((t) => t.id)).toEqual(["tab-2", "tab-1", "tab-3"]);
		expect(result.activeTabId).toBe(state.activeTabId);
	});

	it("returns null for a same-panel move without an index", () => {
		expect(
			moveTabToPanel(baseState(), {
				tabId: "tab-2",
				targetPanelId: "panel-a",
			}),
		).toBeNull();
	});

	it("returns null for an unknown target panel", () => {
		expect(
			moveTabToPanel(baseState(), {
				tabId: "tab-1",
				targetPanelId: "panel-nope",
			}),
		).toBeNull();
	});
});

describe("splitPanelWithTab", () => {
	it("creates a new panel on the right and moves the tab into it", () => {
		const state = createState({
			tabs: [createTab("tab-1"), createTab("tab-2")],
			activeTabId: "tab-1",
		});

		const result = splitPanelWithTab(state, {
			tabId: "tab-2",
			targetPanelId: IMPLICIT_PANEL_ID,
			position: "right",
		});
		expect(result).not.toBeNull();
		if (!result) return;

		const layout = result.panelLayout;
		if (layout.type !== "split") throw new Error("expected split");
		expect(layout.direction).toBe("horizontal");
		expect(layout.first).toEqual(panelNode(IMPLICIT_PANEL_ID));
		if (layout.second.type !== "pane") throw new Error("expected leaf");
		const newPanelId = layout.second.paneId;

		expect(result.tabs.find((t) => t.id === "tab-2")?.panelId).toBe(newPanelId);
		expect(result.panelActiveTabIds[newPanelId]).toBe("tab-2");
		expect(result.panelActiveTabIds[IMPLICIT_PANEL_ID]).toBe("tab-1");
		expect(result.activeTabId).toBe("tab-2");
	});

	it("places the new panel first for top/left positions", () => {
		const state = createState({
			tabs: [createTab("tab-1"), createTab("tab-2")],
			activeTabId: "tab-1",
		});

		const result = splitPanelWithTab(state, {
			tabId: "tab-2",
			targetPanelId: IMPLICIT_PANEL_ID,
			position: "top",
		});
		expect(result).not.toBeNull();
		if (!result) return;

		const layout = result.panelLayout;
		if (layout.type !== "split") throw new Error("expected split");
		expect(layout.direction).toBe("vertical");
		expect(layout.second).toEqual(panelNode(IMPLICIT_PANEL_ID));
	});

	it("collapses the source panel when its only tab splits another panel", () => {
		const state = createState({
			tabs: [
				createTab("tab-1", { panelId: "panel-a" }),
				createTab("tab-2", { panelId: "panel-b" }),
			],
			panelLayout: {
				type: "split",
				direction: "horizontal",
				first: panelNode("panel-a"),
				second: panelNode("panel-b"),
			},
			activeTabId: "tab-1",
		});

		const result = splitPanelWithTab(state, {
			tabId: "tab-2",
			targetPanelId: "panel-a",
			position: "bottom",
		});
		expect(result).not.toBeNull();
		if (!result) return;

		const layout = result.panelLayout;
		if (layout.type !== "split") throw new Error("expected split");
		expect(layout.direction).toBe("vertical");
		expect(layout.first).toEqual(panelNode("panel-a"));
		if (layout.second.type !== "pane") throw new Error("expected leaf");
		expect(layout.second.paneId).not.toBe("panel-b");
	});

	it("returns null when splitting a panel with its own only tab", () => {
		const state = createState({
			tabs: [createTab("tab-1")],
			activeTabId: "tab-1",
		});

		expect(
			splitPanelWithTab(state, {
				tabId: "tab-1",
				targetPanelId: IMPLICIT_PANEL_ID,
				position: "right",
			}),
		).toBeNull();
	});
});

describe("computePanelActiveSync", () => {
	it("records the active tab into its panel", () => {
		const state = createState({
			tabs: [
				createTab("tab-1", { panelId: "panel-a" }),
				createTab("tab-2", { panelId: "panel-b" }),
			],
			panelLayout: twoPanelLayout,
			panelActiveTabIds: { "panel-a": "tab-1" },
			activeTabId: "tab-2",
		});

		expect(computePanelActiveSync(state)).toEqual({
			panelActiveTabIds: { "panel-a": "tab-1", "panel-b": "tab-2" },
		});
	});

	it("returns null when already in sync", () => {
		const state = createState({
			tabs: [createTab("tab-1", { panelId: "panel-a" })],
			panelLayout: panelNode("panel-a"),
			panelActiveTabIds: { "panel-a": "tab-1" },
			activeTabId: "tab-1",
		});

		expect(computePanelActiveSync(state)).toBeNull();
	});
});

describe("expand panel helpers", () => {
	const threePanelLayout: LayoutNode = {
		type: "split",
		direction: "horizontal",
		first: panelNode("panel-a"),
		second: {
			type: "split",
			direction: "vertical",
			first: panelNode("panel-b"),
			second: panelNode("panel-c"),
		},
	};

	it("expands a panel's branch at every ancestor split", () => {
		const expanded = buildExpandedPanelLayout(threePanelLayout, "panel-b");
		expect(expanded).not.toBeNull();
		if (!expanded || expanded.type !== "split") throw new Error("split");
		// panel-b lives in the second branch → first branch shrinks
		expect(expanded.splitPercentage).toBe(25);
		if (expanded.second.type !== "split") throw new Error("split");
		expect(expanded.second.splitPercentage).toBe(75);
	});

	it("returns null for a panel not in the tree", () => {
		expect(buildExpandedPanelLayout(threePanelLayout, "panel-x")).toBeNull();
	});

	it("isPanelExpanded matches only the expanded arrangement", () => {
		const expanded = buildExpandedPanelLayout(threePanelLayout, "panel-a");
		if (!expanded) throw new Error("expected layout");
		expect(isPanelExpanded(expanded, "panel-a")).toBe(true);
		expect(isPanelExpanded(expanded, "panel-b")).toBe(false);
		// Even sizes are not "expanded"
		expect(isPanelExpanded(threePanelLayout, "panel-a")).toBe(false);
	});
});
