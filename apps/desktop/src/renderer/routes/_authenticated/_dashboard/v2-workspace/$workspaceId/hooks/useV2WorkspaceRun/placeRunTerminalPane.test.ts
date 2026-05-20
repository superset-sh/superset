import { describe, expect, test } from "bun:test";
import { createWorkspaceStore } from "@superset/panes";
import type { PaneViewerData, TerminalPaneData } from "../../types";
import { placeRunTerminalPane, RUN_PANE_TITLE } from "./placeRunTerminalPane";

function getRunPanes(
	store: ReturnType<typeof createWorkspaceStore<PaneViewerData>>,
) {
	const runPanes: {
		tabId: string;
		paneId: string;
		terminalId: string;
	}[] = [];
	for (const tab of store.getState().tabs) {
		for (const pane of Object.values(tab.panes)) {
			if (pane.kind === "terminal" && pane.titleOverride === RUN_PANE_TITLE) {
				runPanes.push({
					tabId: tab.id,
					paneId: pane.id,
					terminalId: (pane.data as TerminalPaneData).terminalId,
				});
			}
		}
	}
	return runPanes;
}

describe("placeRunTerminalPane", () => {
	test("creates a Workspace Run tab when none exists", () => {
		const store = createWorkspaceStore<PaneViewerData>();

		placeRunTerminalPane(store, "term-1");

		const runPanes = getRunPanes(store);
		expect(runPanes).toHaveLength(1);
		expect(runPanes[0].terminalId).toBe("term-1");
		expect(store.getState().tabs).toHaveLength(1);
		expect(store.getState().activeTabId).toBe(runPanes[0].tabId);
	});

	test("reuses the existing Workspace Run tab on repeated invocations (regression for #4690)", () => {
		const store = createWorkspaceStore<PaneViewerData>();

		// Add an unrelated tab the user was working in.
		store.getState().addTab({
			id: "editor-tab",
			panes: [
				{
					id: "editor-pane",
					kind: "file",
					data: { filePath: "/tmp/foo.ts", mode: "editor" },
				},
			],
		});

		placeRunTerminalPane(store, "term-1");
		const firstRunTabId = getRunPanes(store)[0].tabId;
		const tabCountAfterFirstRun = store.getState().tabs.length;

		// Simulate the run stopping, then the user triggering Cmd+G / Run again.
		placeRunTerminalPane(store, "term-2");

		const runPanes = getRunPanes(store);
		expect(runPanes).toHaveLength(1);
		expect(store.getState().tabs.length).toBe(tabCountAfterFirstRun);
		expect(runPanes[0].tabId).toBe(firstRunTabId);
		expect(runPanes[0].terminalId).toBe("term-2");
		expect(store.getState().activeTabId).toBe(firstRunTabId);
	});
});
