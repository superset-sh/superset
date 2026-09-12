import { afterEach, describe, expect, it } from "bun:test";
import type { WorkspaceState } from "@superset/panes";
import {
	applyRememberedV2PaneSelection,
	clearRememberedV2PaneSelectionsForTest,
	rememberV2PaneSelection,
} from "./store";

function state(
	activeTabId: string,
	activePaneIds: [string, string][],
): WorkspaceState<null> {
	return {
		version: 1,
		activeTabId,
		tabs: activePaneIds.map(([tabId, paneId]) => ({
			id: tabId,
			createdAt: 1,
			activePaneId: paneId,
			layout: { type: "pane", paneId },
			panes: { [paneId]: { id: paneId, kind: "test", data: null } },
		})),
	};
}

afterEach(clearRememberedV2PaneSelectionsForTest);

describe("v2 pane selection", () => {
	it("overlays only the selection remembered for this renderer and workspace", () => {
		rememberV2PaneSelection(
			"workspace-1",
			state("tab-2", [
				["tab-1", "pane-1"],
				["tab-2", "pane-2"],
			]),
		);
		const shared = state("tab-1", [
			["tab-1", "pane-1"],
			["tab-2", "pane-2"],
		]);

		expect(
			applyRememberedV2PaneSelection("workspace-1", shared).activeTabId,
		).toBe("tab-2");
		expect(
			applyRememberedV2PaneSelection("workspace-2", shared).activeTabId,
		).toBe("tab-1");
	});

	it("ignores remembered ids removed by a shared structural update", () => {
		rememberV2PaneSelection(
			"workspace-1",
			state("tab-2", [["tab-2", "pane-2"]]),
		);

		expect(
			applyRememberedV2PaneSelection(
				"workspace-1",
				state("tab-1", [["tab-1", "pane-1"]]),
			).activeTabId,
		).toBe("tab-1");
	});
});
