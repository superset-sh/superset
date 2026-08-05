import { describe, expect, it } from "bun:test";
import { collectOpenPaneIds } from "./collectOpenPaneIds";

function makeRow(workspaceId: string, paneIdsByTab: Record<string, string[]>) {
	return {
		workspaceId,
		paneLayout: {
			version: 1,
			activeTabId: null,
			tabs: Object.entries(paneIdsByTab).map(([tabId, paneIds]) => ({
				id: tabId,
				createdAt: 0,
				activePaneId: paneIds[0] ?? null,
				layout: { type: "pane", paneId: paneIds[0] },
				panes: Object.fromEntries(
					paneIds.map((paneId) => [paneId, { id: paneId, kind: "chat" }]),
				),
			})),
		},
	};
}

describe("collectOpenPaneIds", () => {
	it("collects pane ids across every tab of every workspace", () => {
		const result = collectOpenPaneIds([
			makeRow("ws-1", { "tab-1": ["pane-a", "pane-b"], "tab-2": ["pane-c"] }),
			makeRow("ws-2", { "tab-3": ["pane-d"] }),
		]);

		expect(result.get("ws-1")).toEqual(new Set(["pane-a", "pane-b", "pane-c"]));
		expect(result.get("ws-2")).toEqual(new Set(["pane-d"]));
	});

	it("records a loaded but empty workspace as an empty set, not as absent", () => {
		// The distinction matters: an empty set prunes that workspace's stale
		// entries, whereas absence would preserve them.
		const result = collectOpenPaneIds([makeRow("ws-1", {})]);

		expect(result.has("ws-1")).toBe(true);
		expect(result.get("ws-1")).toEqual(new Set());
	});

	it("omits workspaces whose layout is missing or malformed", () => {
		const result = collectOpenPaneIds([
			{ workspaceId: "ws-missing" },
			{ workspaceId: "ws-bad", paneLayout: { version: 1 } },
			{ workspaceId: "ws-null", paneLayout: null },
		]);

		expect(result.size).toBe(0);
	});

	it("ignores rows without a usable workspace id", () => {
		const result = collectOpenPaneIds([
			{ workspaceId: "", paneLayout: { version: 1, tabs: [] } },
			{ paneLayout: { version: 1, tabs: [] } },
		]);

		expect(result.size).toBe(0);
	});
});
