import { describe, expect, it } from "bun:test";
import type { Pane } from "shared/tabs-types";
import { mergeRemoteTabsState } from "./merge-remote-state";
import type { Tab } from "./types";

const WS = "ws-1";

function tab(id: string, workspaceId = WS): Tab {
	return {
		id,
		name: id,
		workspaceId,
		createdAt: 0,
		layout: `${id}-pane`,
	};
}

function pane(id: string, tabId: string, extra: Partial<Pane> = {}): Pane {
	return {
		id,
		tabId,
		type: "terminal",
		name: id,
		...extra,
	} as Pane;
}

describe("mergeRemoteTabsState", () => {
	it("takes structure from remote, keeps local selection", () => {
		const local = {
			panes: { p1: pane("p1", "t1"), p2: pane("p2", "t2") },
			activeTabIds: { [WS]: "t2" },
			focusedPaneIds: { t2: "p2" },
			tabHistoryStacks: { [WS]: ["t1", "t2"] },
		};
		const remote = {
			tabs: [tab("t1"), tab("t2"), tab("t3")],
			panes: {
				p1: pane("p1", "t1"),
				p2: pane("p2", "t2"),
				p3: pane("p3", "t3"),
			},
		};

		const result = mergeRemoteTabsState(local, remote);

		expect(result.tabs.map((t) => t.id)).toEqual(["t1", "t2", "t3"]);
		// Local selection untouched — windows stay on their own tab.
		expect(result.activeTabIds[WS]).toBe("t2");
		expect(result.focusedPaneIds.t2).toBe("p2");
	});

	it("keeps local pane status even when the remote snapshot carries a stale one", () => {
		const local = {
			panes: { p1: pane("p1", "t1", { status: "working" }) },
			activeTabIds: {},
			focusedPaneIds: {},
			tabHistoryStacks: {},
		};
		const remote = {
			tabs: [tab("t1")],
			// Schema-realistic: paneSchema persists `status`, so a broadcast
			// snapshotted before our local status change carries the old value.
			panes: { p1: pane("p1", "t1", { status: "idle" }) },
		};

		const result = mergeRemoteTabsState(local, remote);

		// Status is window-local runtime state — remote must not flap it back.
		expect(result.panes.p1?.status).toBe("working");
	});

	it("adopts remote status when the pane has no local status", () => {
		const local = {
			panes: { p1: pane("p1", "t1") },
			activeTabIds: {},
			focusedPaneIds: {},
			tabHistoryStacks: {},
		};
		const remote = {
			tabs: [tab("t1")],
			panes: { p1: pane("p1", "t1", { status: "review" }) },
		};

		const result = mergeRemoteTabsState(local, remote);

		expect(result.panes.p1?.status).toBe("review");
	});

	it("falls back to first workspace tab when the active tab was closed remotely", () => {
		const local = {
			panes: { p2: pane("p2", "t2") },
			activeTabIds: { [WS]: "t2" },
			focusedPaneIds: { t2: "p2" },
			tabHistoryStacks: { [WS]: ["t2"] },
		};
		const remote = {
			tabs: [tab("t1")],
			panes: { p1: pane("p1", "t1") },
		};

		const result = mergeRemoteTabsState(local, remote);

		expect(result.activeTabIds[WS]).toBe("t1");
		// Focused-pane entry for the dead tab is dropped.
		expect(result.focusedPaneIds.t2).toBeUndefined();
		expect(result.tabHistoryStacks[WS]).toEqual([]);
	});

	it("falls back to MRU history, not first tab, when the active tab was closed remotely", () => {
		const local = {
			panes: {
				p1: pane("p1", "t1"),
				p2: pane("p2", "t2"),
				p3: pane("p3", "t3"),
			},
			activeTabIds: { [WS]: "t3" },
			focusedPaneIds: { t3: "p3" },
			// MRU front-to-back: t2 was used more recently than t1.
			tabHistoryStacks: { [WS]: ["t2", "t1"] },
		};
		const remote = {
			tabs: [tab("t1"), tab("t2")],
			panes: { p1: pane("p1", "t1"), p2: pane("p2", "t2") },
		};

		const result = mergeRemoteTabsState(local, remote);

		expect(result.activeTabIds[WS]).toBe("t2");
	});

	it("repoints focus when the focused pane was closed remotely", () => {
		const local = {
			panes: { p1: pane("p1", "t1"), p1b: pane("p1b", "t1") },
			activeTabIds: { [WS]: "t1" },
			focusedPaneIds: { t1: "p1" },
			tabHistoryStacks: { [WS]: ["t1"] },
		};
		const remote = {
			tabs: [tab("t1")],
			panes: { p1b: pane("p1b", "t1") },
		};

		const result = mergeRemoteTabsState(local, remote);

		expect(result.focusedPaneIds.t1).toBe("p1b");
		expect(result.panes.p1).toBeUndefined();
	});

	it("sets active tab to null when a workspace loses all tabs", () => {
		const local = {
			panes: { p1: pane("p1", "t1") },
			activeTabIds: { [WS]: "t1" },
			focusedPaneIds: { t1: "p1" },
			tabHistoryStacks: { [WS]: ["t1"] },
		};
		const remote = { tabs: [], panes: {} };

		const result = mergeRemoteTabsState(local, remote);

		expect(result.activeTabIds[WS]).toBeNull();
		expect(result.focusedPaneIds).toEqual({});
	});
});
