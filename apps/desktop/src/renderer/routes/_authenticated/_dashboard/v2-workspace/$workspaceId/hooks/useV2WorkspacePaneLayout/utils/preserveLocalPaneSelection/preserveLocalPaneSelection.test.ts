import { describe, expect, it } from "bun:test";
import type { LayoutNode, Pane, Tab, WorkspaceState } from "@superset/panes";
import {
	getSharedPaneLayoutSnapshot,
	preserveLocalPaneSelection,
} from "./preserveLocalPaneSelection";

type Data = { value: string };

function layout(...paneIds: string[]): LayoutNode {
	const [first, ...rest] = paneIds;
	if (!first) throw new Error("A tab needs at least one pane");
	return rest.reduce<LayoutNode>(
		(tree, paneId) => ({
			type: "split",
			direction: "horizontal",
			first: tree,
			second: { type: "pane", paneId },
		}),
		{ type: "pane", paneId: first },
	);
}

function tab(id: string, paneIds: string[], activePaneId: string): Tab<Data> {
	return {
		id,
		createdAt: 1,
		activePaneId,
		layout: layout(...paneIds),
		panes: Object.fromEntries(
			paneIds.map(
				(paneId) =>
					[paneId, { id: paneId, kind: "test", data: { value: paneId } }] as [
						string,
						Pane<Data>,
					],
			),
		),
	};
}

function state(
	tabs: Tab<Data>[],
	activeTabId: string | null,
): WorkspaceState<Data> {
	return { version: 1, tabs, activeTabId };
}

describe("preserveLocalPaneSelection", () => {
	it("keeps the current window's active tab and panes during a shared update", () => {
		const previous = state(
			[
				tab("tab-1", ["pane-1", "pane-2"], "pane-2"),
				tab("tab-2", ["pane-3"], "pane-3"),
			],
			"tab-2",
		);
		const next = state(
			[
				tab("tab-1", ["pane-1", "pane-2", "pane-4"], "pane-4"),
				tab("tab-2", ["pane-3"], "pane-3"),
			],
			"tab-1",
		);

		const merged = preserveLocalPaneSelection(previous, next);

		expect(merged.activeTabId).toBe("tab-2");
		expect(merged.tabs[0]?.activePaneId).toBe("pane-2");
		expect(merged.tabs[0]?.panes["pane-4"]).toBeDefined();
	});

	it("selects a nearby survivor when the local tab or pane was removed", () => {
		const previous = state(
			[
				tab("tab-1", ["pane-1"], "pane-1"),
				tab("tab-2", ["pane-2", "pane-3", "pane-4"], "pane-3"),
				tab("tab-3", ["pane-5"], "pane-5"),
			],
			"tab-2",
		);
		const next = state(
			[tab("tab-1", ["pane-1"], "pane-1"), tab("tab-3", ["pane-5"], "pane-5")],
			"tab-1",
		);

		const merged = preserveLocalPaneSelection(previous, next);

		expect(merged.activeTabId).toBe("tab-3");
	});

	it("excludes active selections from the shared comparison snapshot", () => {
		const first = state(
			[tab("tab-1", ["pane-1", "pane-2"], "pane-1")],
			"tab-1",
		);
		const second = state(
			[tab("tab-1", ["pane-1", "pane-2"], "pane-2")],
			"tab-1",
		);

		expect(getSharedPaneLayoutSnapshot(first)).toBe(
			getSharedPaneLayoutSnapshot(second),
		);
	});
});
