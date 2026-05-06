import { describe, expect, test } from "bun:test";
import {
	extractPaneIds,
	extractPaneLocations,
	extractWorkspaceIds,
	getRemovedPaneLocations,
	type PaneLifecycleRow,
} from "./paneLifecycleRows";

function row(
	workspaceId: string,
	panes: Record<string, unknown>,
): PaneLifecycleRow {
	return {
		workspaceId,
		paneLayout: {
			tabs: [
				{
					id: `${workspaceId}-tab`,
					title: "Tab",
					panes,
					layout: null,
					activePaneId: null,
				},
			],
			activeTabId: `${workspaceId}-tab`,
		},
	};
}

function terminalPane(id: string) {
	return {
		id: `pane-${id}`,
		kind: "terminal",
		data: { terminalId: id },
	};
}

function terminalIdForPane(pane: {
	kind: string;
	data: unknown;
}): string | null {
	if (pane.kind !== "terminal") return null;
	const data = pane.data as { terminalId?: unknown };
	return typeof data.terminalId === "string" ? data.terminalId : null;
}

describe("paneLifecycleRows", () => {
	test("extracts workspace IDs and tracked pane locations", () => {
		const rows = [
			row("workspace-a", {
				"pane-term-1": terminalPane("term-1"),
				"pane-file-1": { id: "pane-file-1", kind: "file", data: {} },
			}),
			row("workspace-b", {
				"pane-term-2": terminalPane("term-2"),
			}),
		];

		expect([...extractWorkspaceIds(rows)]).toEqual([
			"workspace-a",
			"workspace-b",
		]);
		expect([
			...extractPaneLocations(rows, terminalIdForPane).entries(),
		]).toEqual([
			["term-1", "workspace-a"],
			["term-2", "workspace-b"],
		]);
		expect([...extractPaneIds(rows, terminalIdForPane)]).toEqual([
			"term-1",
			"term-2",
		]);
	});

	test("marks a pane removed only when its owner workspace row is present", () => {
		const previousLocations = new Map([
			["term-1", "workspace-a"],
			["term-2", "workspace-b"],
		]);
		const currentLocations = new Map([["term-2", "workspace-b"]]);
		const currentWorkspaceIds = new Set(["workspace-a", "workspace-b"]);

		expect(
			getRemovedPaneLocations({
				previousLocations,
				currentLocations,
				currentWorkspaceIds,
			}),
		).toEqual([{ id: "term-1", workspaceId: "workspace-a" }]);
	});

	test("ignores panes whose owner workspace row disappeared", () => {
		const previousLocations = new Map([
			["term-1", "workspace-a"],
			["term-2", "workspace-b"],
		]);
		const currentLocations = new Map([["term-2", "workspace-b"]]);
		const currentWorkspaceIds = new Set(["workspace-b"]);

		expect(
			getRemovedPaneLocations({
				previousLocations,
				currentLocations,
				currentWorkspaceIds,
			}),
		).toEqual([]);
	});
});
