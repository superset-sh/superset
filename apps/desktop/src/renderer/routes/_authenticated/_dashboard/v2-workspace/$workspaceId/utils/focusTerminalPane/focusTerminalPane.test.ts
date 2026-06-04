import { describe, expect, it } from "bun:test";
import {
	createWorkspaceStore,
	type LayoutNode,
	type WorkspaceState,
} from "@superset/panes";
import type { PaneViewerData } from "../../types";
import {
	findTerminalPaneLocation,
	focusOrAddTerminalPane,
	focusTerminalPane,
} from "./focusTerminalPane";

function terminalPane(id: string, terminalId: string) {
	return {
		id,
		kind: "terminal",
		data: { terminalId } as PaneViewerData,
	};
}

function paneLayout(paneId: string): LayoutNode {
	return { type: "pane", paneId };
}

function workspaceState(): WorkspaceState<PaneViewerData> {
	return {
		version: 1,
		activeTabId: "tab-1",
		tabs: [
			{
				id: "tab-1",
				createdAt: 1,
				activePaneId: "pane-1",
				layout: paneLayout("pane-1"),
				panes: {
					"pane-1": terminalPane("pane-1", "terminal-1"),
				},
			},
			{
				id: "tab-2",
				createdAt: 2,
				activePaneId: "pane-2",
				layout: paneLayout("pane-2"),
				panes: {
					"pane-2": terminalPane("pane-2", "terminal-2"),
				},
			},
		],
	};
}

describe("findTerminalPaneLocation", () => {
	it("finds the first pane displaying a terminal", () => {
		expect(findTerminalPaneLocation(workspaceState(), "terminal-2")).toEqual({
			tabId: "tab-2",
			paneId: "pane-2",
		});
	});

	it("returns null when no pane displays the terminal", () => {
		expect(findTerminalPaneLocation(workspaceState(), "missing")).toBeNull();
	});
});

describe("focusTerminalPane", () => {
	it("navigates to an existing terminal pane", () => {
		const store = createWorkspaceStore<PaneViewerData>({
			initialState: workspaceState(),
		});

		expect(focusTerminalPane(store, "terminal-2")).toBe(true);
		expect(store.getState().activeTabId).toBe("tab-2");
		expect(store.getState().getTab("tab-2")?.activePaneId).toBe("pane-2");
		expect(store.getState().tabs).toHaveLength(2);
	});

	it("does not mutate when no pane displays the terminal", () => {
		const store = createWorkspaceStore<PaneViewerData>({
			initialState: workspaceState(),
		});

		expect(focusTerminalPane(store, "missing")).toBe(false);
		expect(store.getState().activeTabId).toBe("tab-1");
		expect(store.getState().getTab("tab-1")?.activePaneId).toBe("pane-1");
		expect(store.getState().tabs).toHaveLength(2);
	});
});

describe("focusOrAddTerminalPane", () => {
	it("focuses an existing terminal pane instead of adding a duplicate", () => {
		const store = createWorkspaceStore<PaneViewerData>({
			initialState: workspaceState(),
		});

		expect(focusOrAddTerminalPane(store, "terminal-2")).toBe("focused");
		expect(store.getState().activeTabId).toBe("tab-2");
		expect(store.getState().tabs).toHaveLength(2);
	});

	it("adds a terminal pane when no existing pane displays it", () => {
		const store = createWorkspaceStore<PaneViewerData>({
			initialState: workspaceState(),
		});

		expect(focusOrAddTerminalPane(store, "terminal-3")).toBe("added");

		const state = store.getState();
		expect(state.tabs).toHaveLength(3);
		const activeTab = state.tabs.find((tab) => tab.id === state.activeTabId);
		expect(activeTab).toBeDefined();
		expect(
			Object.values(activeTab?.panes ?? {}).some(
				(pane) =>
					pane.kind === "terminal" &&
					(pane.data as { terminalId?: string }).terminalId === "terminal-3",
			),
		).toBe(true);
	});
});
