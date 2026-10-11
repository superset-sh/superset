import { describe, expect, test } from "bun:test";
import type { LayoutNode, WorkspaceState } from "@superset/panes";
import type { PaneViewerData } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/types";
import { applyPaneLayoutOp, PaneLayoutOpError } from "./applyPaneLayoutOp";

function terminal(id: string) {
	return {
		id,
		kind: "terminal",
		data: { terminalId: `term-${id}` },
	};
}

const leaf = (paneId: string): LayoutNode => ({ type: "pane", paneId });

function fixture(): WorkspaceState<PaneViewerData> {
	return {
		version: 1,
		activeTabId: "tab-1",
		tabs: [
			{
				id: "tab-1",
				createdAt: 1,
				activePaneId: "a",
				layout: {
					type: "split",
					direction: "horizontal",
					splitPercentage: 50,
					first: leaf("a"),
					second: leaf("b"),
				},
				panes: { a: terminal("a"), b: terminal("b") },
			},
			{
				id: "tab-2",
				createdAt: 2,
				activePaneId: "c",
				layout: leaf("c"),
				panes: { c: terminal("c") },
			},
		],
	};
}

function expectError(run: () => unknown, code: PaneLayoutOpError["code"]) {
	try {
		run();
	} catch (error) {
		expect(error).toBeInstanceOf(PaneLayoutOpError);
		expect((error as PaneLayoutOpError).code).toBe(code);
		return;
	}
	throw new Error("Expected a PaneLayoutOpError");
}

describe("applyPaneLayoutOp", () => {
	test("newTab adds a terminal tab without taking focus from an open tab", () => {
		const { state, paneId, tabId } = applyPaneLayoutOp(
			fixture(),
			{ type: "newTab", terminalId: "t-new" },
			() => "new",
		);
		expect(paneId).toBe("new");
		expect(state.tabs).toHaveLength(3);
		expect(state.tabs.find((tab) => tab.id === tabId)?.panes.new?.data).toEqual(
			{ terminalId: "t-new" },
		);
		expect(state.activeTabId).toBe("tab-1");
	});

	test("newTab in an empty workspace makes the new tab active", () => {
		const { state, tabId } = applyPaneLayoutOp(
			{ version: 1, activeTabId: null, tabs: [] },
			{ type: "newTab", terminalId: "t-new" },
			() => "new",
		);
		expect(state.activeTabId).toBe(tabId);
	});

	test("split puts a terminal pane on the requested side and keeps focus", () => {
		const { state, paneId, tabId } = applyPaneLayoutOp(
			fixture(),
			{ type: "split", paneId: "b", direction: "down", terminalId: "t-new" },
			() => "new",
		);
		expect(paneId).toBe("new");
		expect(tabId).toBe("tab-1");
		const tab = state.tabs[0];
		expect(tab?.layout).toEqual({
			type: "split",
			direction: "horizontal",
			splitPercentage: 50,
			first: leaf("a"),
			second: {
				type: "split",
				direction: "vertical",
				first: leaf("b"),
				second: leaf("new"),
			},
		});
		expect(tab?.panes.new?.data).toEqual({ terminalId: "t-new" });
		expect(tab?.activePaneId).toBe("a");
	});

	test("resize gives the pane its ratio whichever side of the split it is on", () => {
		const second = applyPaneLayoutOp(fixture(), {
			type: "resize",
			paneId: "b",
			ratio: 0.3,
		}).state.tabs[0]?.layout;
		expect(second?.type === "split" && second.splitPercentage).toBeCloseTo(70);
		const first = applyPaneLayoutOp(fixture(), {
			type: "resize",
			paneId: "a",
			ratio: 0.3,
		}).state.tabs[0]?.layout;
		expect(first?.type === "split" && first.splitPercentage).toBeCloseTo(30);
	});

	test("resize of a pane alone in its tab is a bad request", () => {
		expectError(
			() =>
				applyPaneLayoutOp(fixture(), {
					type: "resize",
					paneId: "c",
					ratio: 0.5,
				}),
			"BAD_REQUEST",
		);
	});

	test("equalize resets split ratios", () => {
		const skewed = applyPaneLayoutOp(fixture(), {
			type: "resize",
			paneId: "a",
			ratio: 0.2,
		}).state;
		const layout = applyPaneLayoutOp(skewed, { type: "equalize" }).state.tabs[0]
			?.layout;
		expect(layout?.type === "split" && layout.splitPercentage).toBe(50);
	});

	test("focus selects the pane and its tab", () => {
		const { state } = applyPaneLayoutOp(fixture(), {
			type: "focus",
			paneId: "c",
		});
		expect(state.activeTabId).toBe("tab-2");
		expect(state.tabs[1]?.activePaneId).toBe("c");
	});

	test("close removes the pane and moves focus to a sibling", () => {
		const { state } = applyPaneLayoutOp(fixture(), {
			type: "close",
			paneId: "a",
		});
		expect(state.tabs[0]?.layout).toEqual(leaf("b"));
		expect(state.tabs[0]?.activePaneId).toBe("b");
	});

	test("move splits the pane into another tab and removes the emptied tab", () => {
		const { state, tabId } = applyPaneLayoutOp(fixture(), {
			type: "move",
			paneId: "c",
			targetPaneId: "a",
			direction: "left",
		});
		expect(tabId).toBe("tab-1");
		expect(state.tabs.map((tab) => tab.id)).toEqual(["tab-1"]);
		expect(state.activeTabId).toBe("tab-1");
		expect(state.tabs[0]?.activePaneId).toBe("a");
	});

	test("moveToNewTab gives the pane its own tab", () => {
		const { state, tabId } = applyPaneLayoutOp(fixture(), {
			type: "moveToNewTab",
			paneId: "b",
		});
		expect(state.tabs).toHaveLength(3);
		const created = state.tabs.find((tab) => tab.id === tabId);
		expect(created?.layout).toEqual(leaf("b"));
		expect(state.activeTabId).toBe("tab-1");
	});

	test("swap exchanges positions within a tab and across tabs", () => {
		const within = applyPaneLayoutOp(fixture(), {
			type: "swap",
			paneId: "a",
			withPaneId: "b",
		}).state.tabs[0]?.layout;
		expect(within?.type === "split" && [within.first, within.second]).toEqual([
			leaf("b"),
			leaf("a"),
		]);

		const across = applyPaneLayoutOp(fixture(), {
			type: "swap",
			paneId: "a",
			withPaneId: "c",
		}).state;
		expect(Object.keys(across.tabs[0]?.panes ?? {}).sort()).toEqual(["b", "c"]);
		expect(across.tabs[1]?.layout).toEqual(leaf("a"));
		expect(across.tabs[1]?.panes.a?.data).toEqual({ terminalId: "term-a" });
	});

	test("an unknown pane is not found", () => {
		expectError(
			() => applyPaneLayoutOp(fixture(), { type: "focus", paneId: "nope" }),
			"NOT_FOUND",
		);
	});
});
