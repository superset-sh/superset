import { describe, expect, it } from "bun:test";
import type { Tab } from "../../../types";
import {
	type PersistedWorkspaceState,
	sanitizeWorkspaceState,
	toWorkspaceState,
} from "./persistence";

const validTab: Tab<unknown> = {
	id: "tab-1",
	createdAt: 0,
	activePaneId: "pane-1",
	layout: { type: "pane", paneId: "pane-1" },
	panes: { "pane-1": { id: "pane-1", kind: "terminal", data: {} } },
};

const EMPTY: PersistedWorkspaceState<unknown> = {
	version: 1,
	tabs: [],
	activeTabId: null,
	panelLayout: null,
	panelActiveTabIds: {},
};

describe("sanitizeWorkspaceState", () => {
	it("resets non-object / legacy / versionless input to empty", () => {
		expect(sanitizeWorkspaceState(null)).toEqual(EMPTY);
		expect(sanitizeWorkspaceState("garbage")).toEqual(EMPTY);
		expect(sanitizeWorkspaceState({ panes: [], focusedPaneId: null })).toEqual(
			EMPTY,
		);
		expect(sanitizeWorkspaceState({ version: 1 })).toEqual(EMPTY);
	});

	it("keeps a valid state intact, including panel fields", () => {
		const state: PersistedWorkspaceState<unknown> = {
			version: 1,
			tabs: [
				{ ...validTab, panelId: "panel-a" },
				{
					...validTab,
					id: "tab-2",
					activePaneId: "pane-2",
					layout: { type: "pane", paneId: "pane-2" },
					panes: { "pane-2": { id: "pane-2", kind: "chat", data: {} } },
					panelId: "panel-b",
				},
			],
			activeTabId: "tab-1",
			panelLayout: {
				type: "split",
				direction: "horizontal",
				splitPercentage: 50,
				first: { type: "pane", paneId: "panel-a" },
				second: { type: "pane", paneId: "panel-b" },
			},
			panelActiveTabIds: { "panel-a": "tab-1", "panel-b": "tab-2" },
		};
		expect(sanitizeWorkspaceState(state)).toEqual(state);
	});

	it("drops a corrupt tab (split missing a child) but keeps valid tabs", () => {
		const result = sanitizeWorkspaceState({
			version: 1,
			tabs: [
				{
					id: "tab-bad",
					createdAt: 0,
					activePaneId: null,
					layout: {
						type: "split",
						direction: "horizontal",
						first: { type: "pane", paneId: "x" },
					},
					panes: {},
				},
				validTab,
			],
			activeTabId: "tab-bad",
		});
		expect(result.tabs).toHaveLength(1);
		expect(result.tabs[0]?.id).toBe("tab-1");
		// activeTabId pointed at the dropped tab → repaired to a survivor
		expect(result.activeTabId).toBe("tab-1");
	});

	it("drops malformed panel fields without touching tabs", () => {
		const result = sanitizeWorkspaceState({
			version: 1,
			tabs: [validTab],
			activeTabId: "tab-1",
			panelLayout: { type: "split", direction: "horizontal" },
			panelActiveTabIds: { "panel-a": 42 },
		});
		expect(result.tabs).toHaveLength(1);
		expect(result.panelLayout).toBeNull();
		expect(result.panelActiveTabIds).toEqual({});
	});

	it("never throws on hostile input", () => {
		expect(() => sanitizeWorkspaceState(42)).not.toThrow();
		expect(() =>
			sanitizeWorkspaceState({ version: 1, tabs: [1, "x", {}] }),
		).not.toThrow();
	});
});

describe("toWorkspaceState", () => {
	it("materializes optional panel fields", () => {
		const snapshot = toWorkspaceState({
			version: 1,
			tabs: [validTab],
			activeTabId: "tab-1",
		});
		expect(snapshot.panelLayout).toBeNull();
		expect(snapshot.panelActiveTabIds).toEqual({});
	});
});
