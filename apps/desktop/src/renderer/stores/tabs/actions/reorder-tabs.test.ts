import { describe, expect, it } from "bun:test";
import type { MosaicNode } from "react-mosaic-component";
import type { Tab } from "../types";
import { reorderTabsInState } from "./reorder-tabs";
import { resolveTabHeaderDrop } from "./resolve-tab-drop";

const WORKSPACE_ID = "ws-1";

function createTab(id: string, workspaceId = WORKSPACE_ID): Tab {
	return {
		id,
		name: id,
		workspaceId,
		layout: id as MosaicNode<string>,
		createdAt: 0,
	};
}

function ids(tabs: Tab[], workspaceId = WORKSPACE_ID): string[] {
	return tabs.filter((t) => t.workspaceId === workspaceId).map((t) => t.id);
}

describe("reorderTabsInState", () => {
	it("moves a tab to a later position", () => {
		const tabs = [createTab("a"), createTab("b"), createTab("c")];
		expect(ids(reorderTabsInState(tabs, WORKSPACE_ID, 0, 2))).toEqual([
			"b",
			"c",
			"a",
		]);
	});

	it("moves a tab to an earlier position", () => {
		const tabs = [createTab("a"), createTab("b"), createTab("c")];
		expect(ids(reorderTabsInState(tabs, WORKSPACE_ID, 2, 1))).toEqual([
			"a",
			"c",
			"b",
		]);
	});

	it("leaves tabs from other workspaces untouched", () => {
		const tabs = [
			createTab("a"),
			createTab("x", "ws-2"),
			createTab("b"),
			createTab("y", "ws-2"),
		];
		const result = reorderTabsInState(tabs, WORKSPACE_ID, 0, 1);
		expect(ids(result)).toEqual(["b", "a"]);
		expect(ids(result, "ws-2")).toEqual(["x", "y"]);
	});

	it("returns the same reference for no-op and invalid moves", () => {
		const tabs = [createTab("a"), createTab("b")];
		expect(reorderTabsInState(tabs, WORKSPACE_ID, 0, 0)).toBe(tabs);
		expect(reorderTabsInState(tabs, WORKSPACE_ID, -1, 0)).toBe(tabs);
		expect(reorderTabsInState(tabs, WORKSPACE_ID, 5, 0)).toBe(tabs);
	});
});

describe("resolveTabHeaderDrop (issue #5099)", () => {
	// Reproduces the reported bug: dragging a tab in the strip to reorder it
	// behaved like a Mosaic window drag — releasing over the active tab's
	// content surfaced the split indicators and merged the tab as a pane
	// instead of simply repositioning it. A reorder gesture must never merge.
	it("never merges when a tab header is dragged to reorder it", () => {
		const resolution = resolveTabHeaderDrop({
			draggedTabId: "tab-c",
			// The HTML5 backend reports a Mosaic drop over the active tab's
			// content because the old tab drag used MosaicDragType.WINDOW.
			mosaicDrop: { path: [], position: "right" },
			activeTabId: "tab-a",
		});

		expect(resolution.kind).toBe("reorder");
	});

	it("treats a plain strip drop as a reorder", () => {
		const resolution = resolveTabHeaderDrop({
			draggedTabId: "tab-c",
			mosaicDrop: null,
			activeTabId: "tab-a",
		});

		expect(resolution.kind).toBe("reorder");
	});
});
