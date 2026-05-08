import { describe, expect, test } from "bun:test";
import { createWorkspaceStore } from "@superset/panes";
import type { PaneViewerData } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/types";
import { replaceTerminalInPane } from "./replaceTerminalInPane";

function makeStore() {
	const store = createWorkspaceStore<PaneViewerData>();
	store.getState().addTab({
		id: "tab-1",
		panes: [
			{
				id: "pane-a",
				kind: "terminal",
				data: { terminalId: "term-a" },
			},
			{
				id: "pane-b",
				kind: "terminal",
				data: { terminalId: "term-b" },
			},
		],
	});
	return store;
}

describe("replaceTerminalInPane", () => {
	test("replaces the pane's terminalId in place", () => {
		const store = makeStore();
		store.getState().setActivePane({ tabId: "tab-1", paneId: "pane-b" });

		replaceTerminalInPane({
			state: store.getState(),
			tabId: "tab-1",
			paneId: "pane-b",
			currentTerminalId: "term-b",
			nextTerminalId: "term-new",
		});

		const pane = store.getState().getPane("pane-b");
		expect(pane?.pane.data).toEqual({ terminalId: "term-new" });
	});

	test("clears the pane's title override so the new terminal can set its own title", () => {
		const store = makeStore();
		store.getState().setPaneTitleOverride({
			tabId: "tab-1",
			paneId: "pane-b",
			titleOverride: "old custom title",
		});

		replaceTerminalInPane({
			state: store.getState(),
			tabId: "tab-1",
			paneId: "pane-b",
			currentTerminalId: "term-b",
			nextTerminalId: "term-new",
		});

		const pane = store.getState().getPane("pane-b");
		expect(pane?.pane.titleOverride).toBeUndefined();
	});

	// Repro for #4131: clicking "+" in pane B's terminal-session dropdown while
	// pane A is the active pane in the tab should make pane B active so keyboard
	// focus can reach the new terminal. Previously handleNewTerminal only called
	// setPaneData/setPaneTitleOverride and left activePaneId unchanged, so the
	// user had to click the new terminal before they could type.
	test("makes the target pane active so focus can follow the new terminal", () => {
		const store = makeStore();
		store.getState().setActivePane({ tabId: "tab-1", paneId: "pane-a" });
		expect(store.getState().getActivePane("tab-1")?.pane.id).toBe("pane-a");

		replaceTerminalInPane({
			state: store.getState(),
			tabId: "tab-1",
			paneId: "pane-b",
			currentTerminalId: "term-b",
			nextTerminalId: "term-new",
		});

		expect(store.getState().getActivePane("tab-1")?.pane.id).toBe("pane-b");
	});
});
