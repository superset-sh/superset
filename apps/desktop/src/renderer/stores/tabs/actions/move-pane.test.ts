import { describe, expect, it } from "bun:test";
import type { MosaicNode } from "react-mosaic-component";
import type { Pane, Tab, TabsState } from "../types";
import { mergeTabIntoTab } from "./move-pane";

const WORKSPACE_ID = "ws-1";

function createTab(id: string, layout: MosaicNode<string>, name = id): Tab {
	return {
		id,
		name,
		workspaceId: WORKSPACE_ID,
		layout,
		createdAt: 0,
	};
}

function createPane(id: string, tabId: string, name = id): Pane {
	return {
		id,
		tabId,
		type: "terminal",
		name,
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
		...overrides,
	};
}

describe("mergeTabIntoTab", () => {
	it("merges source tab to the right of target", () => {
		const state = createState({
			tabs: [createTab("tab-src", "pane-a"), createTab("tab-tgt", "pane-b")],
			panes: {
				"pane-a": createPane("pane-a", "tab-src"),
				"pane-b": createPane("pane-b", "tab-tgt"),
			},
			activeTabIds: { [WORKSPACE_ID]: "tab-tgt" },
			focusedPaneIds: { "tab-src": "pane-a", "tab-tgt": "pane-b" },
			tabHistoryStacks: { [WORKSPACE_ID]: [] },
		});

		const result = mergeTabIntoTab(state, "tab-src", "tab-tgt", [], "right");
		expect(result).not.toBeNull();
		if (!result) return;

		expect(result.tabs).toHaveLength(1);
		const tgt = result.tabs.find((t) => t.id === "tab-tgt");
		expect(tgt).toBeDefined();
		expect(tgt?.layout).toEqual({
			direction: "row",
			first: "pane-b",
			second: "pane-a",
			splitPercentage: 50,
		});
		expect(result.panes["pane-a"].tabId).toBe("tab-tgt");
		expect(result.focusedPaneIds["tab-tgt"]).toBe("pane-b");
	});

	it("merges source tab to the bottom of target", () => {
		const state = createState({
			tabs: [createTab("tab-src", "pane-a"), createTab("tab-tgt", "pane-b")],
			panes: {
				"pane-a": createPane("pane-a", "tab-src"),
				"pane-b": createPane("pane-b", "tab-tgt"),
			},
			activeTabIds: { [WORKSPACE_ID]: "tab-tgt" },
			focusedPaneIds: { "tab-src": "pane-a", "tab-tgt": "pane-b" },
			tabHistoryStacks: { [WORKSPACE_ID]: [] },
		});

		const result = mergeTabIntoTab(state, "tab-src", "tab-tgt", [], "bottom");
		expect(result).not.toBeNull();
		if (!result) return;

		const tgt = result.tabs.find((t) => t.id === "tab-tgt");
		expect(tgt?.layout).toEqual({
			direction: "column",
			first: "pane-b",
			second: "pane-a",
			splitPercentage: 50,
		});
	});

	it("merges source tab to the left (source is first)", () => {
		const state = createState({
			tabs: [createTab("tab-src", "pane-a"), createTab("tab-tgt", "pane-b")],
			panes: {
				"pane-a": createPane("pane-a", "tab-src"),
				"pane-b": createPane("pane-b", "tab-tgt"),
			},
			activeTabIds: { [WORKSPACE_ID]: "tab-tgt" },
			focusedPaneIds: { "tab-src": "pane-a", "tab-tgt": "pane-b" },
			tabHistoryStacks: { [WORKSPACE_ID]: [] },
		});

		const result = mergeTabIntoTab(state, "tab-src", "tab-tgt", [], "left");
		expect(result).not.toBeNull();
		if (!result) return;

		const tgt = result.tabs.find((t) => t.id === "tab-tgt");
		expect(tgt?.layout).toEqual({
			direction: "row",
			first: "pane-a",
			second: "pane-b",
			splitPercentage: 50,
		});
	});

	it("merges into a nested destination path without replacing sibling branches", () => {
		const state = createState({
			tabs: [
				createTab("tab-src", "pane-a"),
				createTab("tab-tgt", {
					direction: "row",
					first: "pane-b",
					second: "pane-c",
					splitPercentage: 50,
				}),
			],
			panes: {
				"pane-a": createPane("pane-a", "tab-src"),
				"pane-b": createPane("pane-b", "tab-tgt"),
				"pane-c": createPane("pane-c", "tab-tgt"),
			},
			activeTabIds: { [WORKSPACE_ID]: "tab-tgt" },
			focusedPaneIds: { "tab-src": "pane-a", "tab-tgt": "pane-c" },
			tabHistoryStacks: { [WORKSPACE_ID]: [] },
		});

		const result = mergeTabIntoTab(
			state,
			"tab-src",
			"tab-tgt",
			["second"],
			"bottom",
		);
		expect(result).not.toBeNull();
		if (!result) return;

		const tgt = result.tabs.find((t) => t.id === "tab-tgt");
		expect(tgt?.layout).toEqual({
			direction: "row",
			first: "pane-b",
			second: {
				direction: "column",
				first: "pane-c",
				second: "pane-a",
				splitPercentage: 50,
			},
			splitPercentage: 50,
		});
		expect(result.panes["pane-a"].tabId).toBe("tab-tgt");
		expect(result.focusedPaneIds["tab-tgt"]).toBe("pane-c");
	});

	it("aborts merge when source tab has orphaned panes", () => {
		const state = createState({
			tabs: [
				createTab("tab-source", "pane-visible"),
				createTab("tab-target", "pane-target"),
			],
			panes: {
				"pane-visible": createPane("pane-visible", "tab-source"),
				"pane-orphan": createPane("pane-orphan", "tab-source"),
				"pane-target": createPane("pane-target", "tab-target"),
			},
			activeTabIds: { [WORKSPACE_ID]: "tab-target" },
			focusedPaneIds: {
				"tab-source": "pane-visible",
				"tab-target": "pane-target",
			},
			tabHistoryStacks: { [WORKSPACE_ID]: ["tab-source"] },
		});

		const result = mergeTabIntoTab(
			state,
			"tab-source",
			"tab-target",
			[],
			"right",
		);
		expect(result).toBeNull();
	});

	it("returns null for same tab", () => {
		const state = createState({
			tabs: [createTab("tab-a", "pane-a")],
			panes: { "pane-a": createPane("pane-a", "tab-a") },
			activeTabIds: { [WORKSPACE_ID]: "tab-a" },
		});
		expect(mergeTabIntoTab(state, "tab-a", "tab-a", [], "right")).toBeNull();
	});

	it("returns null when tabs are in different workspaces", () => {
		const state = createState({
			tabs: [
				createTab("tab-a", "pane-a"),
				{ ...createTab("tab-b", "pane-b"), workspaceId: "ws-other" },
			],
			panes: {
				"pane-a": createPane("pane-a", "tab-a"),
				"pane-b": createPane("pane-b", "tab-b"),
			},
		});
		expect(mergeTabIntoTab(state, "tab-a", "tab-b", [], "right")).toBeNull();
	});
});
