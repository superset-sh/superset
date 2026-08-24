import { describe, expect, it } from "bun:test";
import type { LayoutNode, Pane, Tab, WorkspaceState } from "@superset/panes";
import { dropUnavailablePanes } from "./dropUnavailablePanes";

type Data = Record<string, unknown>;

function pane(id: string, kind: string): Pane<Data> {
	return { id, kind, data: {} };
}

function tab(id: string, panes: Pane<Data>[], layout: LayoutNode): Tab<Data> {
	return {
		id,
		createdAt: 0,
		activePaneId: panes[0]?.id ?? null,
		layout,
		panes: Object.fromEntries(panes.map((p) => [p.id, p])),
	};
}

function leaf(paneId: string): LayoutNode {
	return { type: "pane", paneId };
}

function split(first: LayoutNode, second: LayoutNode): LayoutNode {
	return { type: "split", direction: "horizontal", first, second };
}

function state(tabs: Tab<Data>[], activeTabId: string | null) {
	return { version: 1, tabs, activeTabId } as WorkspaceState<Data>;
}

describe("dropUnavailablePanes", () => {
	it("returns the state untouched when nothing is unavailable", () => {
		const input = state([tab("t1", [pane("p1", "page")], leaf("p1"))], "t1");
		expect(dropUnavailablePanes(input, [])).toBe(input);
	});

	it("returns the same reference when no pane matches", () => {
		const input = state(
			[tab("t1", [pane("p1", "terminal")], leaf("p1"))],
			"t1",
		);
		expect(dropUnavailablePanes(input, ["page"])).toBe(input);
	});

	it("drops the pane and promotes its sibling", () => {
		const input = state(
			[
				tab(
					"t1",
					[pane("p1", "terminal"), pane("p2", "page")],
					split(leaf("p1"), leaf("p2")),
				),
			],
			"t1",
		);

		const result = dropUnavailablePanes(input, ["page"]);
		const [only] = result.tabs;
		expect(Object.keys(only?.panes ?? {})).toEqual(["p1"]);
		expect(only?.layout).toEqual(leaf("p1"));
		expect(result.activeTabId).toBe("t1");
	});

	it("moves activePaneId off a dropped pane", () => {
		const withActivePage = {
			...tab(
				"t1",
				[pane("p1", "terminal"), pane("p2", "page")],
				split(leaf("p1"), leaf("p2")),
			),
			activePaneId: "p2",
		};

		const result = dropUnavailablePanes(state([withActivePage], "t1"), [
			"page",
		]);
		expect(result.tabs[0]?.activePaneId).toBe("p1");
	});

	it("closes a tab that held nothing else, activating the tab to its right", () => {
		const input = state(
			[
				tab("t1", [pane("p1", "terminal")], leaf("p1")),
				tab("t2", [pane("p2", "page")], leaf("p2")),
				tab("t3", [pane("p3", "terminal")], leaf("p3")),
			],
			"t2",
		);

		const result = dropUnavailablePanes(input, ["page"]);
		expect(result.tabs.map((t) => t.id)).toEqual(["t1", "t3"]);
		expect(result.activeTabId).toBe("t3");
	});

	it("falls back to the left when nothing survives to the right", () => {
		const input = state(
			[
				tab("t1", [pane("p1", "terminal")], leaf("p1")),
				tab("t2", [pane("p2", "page")], leaf("p2")),
				tab("t3", [pane("p3", "page")], leaf("p3")),
			],
			"t2",
		);

		const result = dropUnavailablePanes(input, ["page"]);
		expect(result.tabs.map((t) => t.id)).toEqual(["t1"]);
		expect(result.activeTabId).toBe("t1");
	});

	it("leaves no active tab when every tab closes", () => {
		const input = state(
			[
				tab("t1", [pane("p1", "page")], leaf("p1")),
				tab("t2", [pane("p2", "page")], leaf("p2")),
			],
			"t1",
		);

		const result = dropUnavailablePanes(input, ["page"]);
		expect(result.tabs).toEqual([]);
		expect(result.activeTabId).toBeNull();
	});

	it("keeps an untouched tab's identity, so unrelated panes never remount", () => {
		const untouched = tab("t1", [pane("p1", "terminal")], leaf("p1"));
		const input = state(
			[untouched, tab("t2", [pane("p2", "page")], leaf("p2"))],
			"t1",
		);

		expect(dropUnavailablePanes(input, ["page"]).tabs[0]).toBe(untouched);
	});
});
