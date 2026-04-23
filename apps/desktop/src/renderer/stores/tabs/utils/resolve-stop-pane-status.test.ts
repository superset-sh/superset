import { describe, expect, it } from "bun:test";
import type { Pane } from "shared/tabs-types";
import {
	parseWorkspaceIdFromHash,
	resolveStopPaneStatus,
} from "./resolve-stop-pane-status";

interface State {
	panes: Record<string, Pane>;
	activeTabIds: Record<string, string | null>;
	focusedPaneIds: Record<string, string>;
}

const makePane = (
	id: string,
	tabId: string,
	status?: "working" | "permission",
): Pane => ({
	id,
	tabId,
	type: "terminal",
	name: "Terminal",
	status,
});

const makeState = (opts: {
	panes: Pane[];
	activeTabIds?: Record<string, string>;
	focusedPaneIds?: Record<string, string>;
}): State => ({
	panes: Object.fromEntries(opts.panes.map((p) => [p.id, p])),
	activeTabIds: opts.activeTabIds ?? {},
	focusedPaneIds: opts.focusedPaneIds ?? {},
});

describe("resolveStopPaneStatus", () => {
	it("returns 'review' when the user is on a different workspace (repro #3689)", () => {
		// A freshly-created tab with one pane always has focusedPaneIds[tabId]
		// set to that pane — it's the "last focused" marker, not proof the user
		// is currently viewing the pane. The Stop hook must still transition
		// the background pane to "review" so the sidebar shows the green dot.
		const state = makeState({
			panes: [makePane("pane-1", "tab-1", "working")],
			activeTabIds: { "ws-1": "tab-1" },
			focusedPaneIds: { "tab-1": "pane-1" },
		});

		const status = resolveStopPaneStatus(state, "ws-1", "pane-1", "ws-2");

		expect(status).toBe("review");
	});

	it("returns 'review' when the user is off-route entirely (e.g. settings page)", () => {
		const state = makeState({
			panes: [makePane("pane-1", "tab-1", "working")],
			activeTabIds: { "ws-1": "tab-1" },
			focusedPaneIds: { "tab-1": "pane-1" },
		});

		const status = resolveStopPaneStatus(state, "ws-1", "pane-1", null);

		expect(status).toBe("review");
	});

	it("returns 'idle' when the user is actively viewing the pane", () => {
		const state = makeState({
			panes: [makePane("pane-1", "tab-1", "working")],
			activeTabIds: { "ws-1": "tab-1" },
			focusedPaneIds: { "tab-1": "pane-1" },
		});

		const status = resolveStopPaneStatus(state, "ws-1", "pane-1", "ws-1");

		expect(status).toBe("idle");
	});

	it("returns 'review' when the user is on the workspace but a different tab is active", () => {
		const state = makeState({
			panes: [makePane("pane-1", "tab-1", "working")],
			activeTabIds: { "ws-1": "tab-2" },
			focusedPaneIds: { "tab-1": "pane-1" },
		});

		const status = resolveStopPaneStatus(state, "ws-1", "pane-1", "ws-1");

		expect(status).toBe("review");
	});

	it("returns 'idle' when stopping from a permission state regardless of view", () => {
		const state = makeState({
			panes: [makePane("pane-1", "tab-1", "permission")],
			activeTabIds: { "ws-1": "tab-2" },
			focusedPaneIds: { "tab-1": "pane-1" },
		});

		const status = resolveStopPaneStatus(state, "ws-1", "pane-1", "ws-2");

		expect(status).toBe("idle");
	});

	it("returns 'review' for a multi-pane tab when the other pane is focused", () => {
		const state = makeState({
			panes: [
				makePane("pane-1", "tab-1", "working"),
				makePane("pane-2", "tab-1"),
			],
			activeTabIds: { "ws-1": "tab-1" },
			focusedPaneIds: { "tab-1": "pane-2" },
		});

		const status = resolveStopPaneStatus(state, "ws-1", "pane-1", "ws-1");

		expect(status).toBe("review");
	});
});

describe("parseWorkspaceIdFromHash", () => {
	it("parses the classic /workspace/<id> route", () => {
		expect(parseWorkspaceIdFromHash("#/workspace/abc123")).toBe("abc123");
	});

	it("parses the /v2-workspace/<id> route", () => {
		expect(parseWorkspaceIdFromHash("#/v2-workspace/abc123")).toBe("abc123");
	});

	it("returns null off-route", () => {
		expect(parseWorkspaceIdFromHash("#/settings")).toBeNull();
	});

	it("ignores query and hash suffixes in the id segment", () => {
		expect(parseWorkspaceIdFromHash("#/workspace/abc?tabId=t1")).toBe("abc");
	});
});
