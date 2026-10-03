import { describe, expect, it } from "bun:test";
import { createWorkspaceStore } from "@superset/panes";
import type { FilePaneData, PaneViewerData } from "../../../../types";
import { openFilePaneInStore } from "../../../useWorkspaceFileNavigation/utils/openFilePaneInStore";
import { openRequestedFilePanes } from "./openRequestedFilePanes";

function makeStore() {
	const store = createWorkspaceStore<PaneViewerData>();
	store.getState().addTab({
		panes: [{ kind: "terminal", data: { terminalId: "terminal" } }],
	});
	return store;
}

function filePanesOf(store: ReturnType<typeof makeStore>, tabIndex: number) {
	const tab = store.getState().tabs[tabIndex];
	if (!tab) throw new Error(`no tab ${tabIndex}`);
	return Object.values(tab.panes)
		.filter((pane) => pane.kind === "file")
		.map((pane) => ({
			id: pane.id,
			pinned: pane.pinned ?? false,
			data: pane.data as FilePaneData,
		}));
}

const openVia =
	(store: ReturnType<typeof makeStore>) =>
	(path: string, newTab?: boolean, position?: { line: number }) =>
		openFilePaneInStore(store, path, newTab, position);

describe("openRequestedFilePanes", () => {
	it("splits every file beside the active pane in the current tab", () => {
		const store = makeStore();
		const paneIds = openRequestedFilePanes(
			store,
			{ paths: ["/repo/a.ts", "/repo/b.ts"], target: "current-tab" },
			openVia(store),
		);
		expect(store.getState().tabs).toHaveLength(1);
		const panes = filePanesOf(store, 0);
		expect(panes.map((pane) => pane.data.filePath)).toEqual([
			"/repo/a.ts",
			"/repo/b.ts",
		]);
		expect(panes.map((pane) => pane.pinned)).toEqual([true, false]);
		expect(paneIds).toEqual(panes.map((pane) => pane.id));
		expect(store.getState().getActivePane()?.pane.id).toBe(paneIds[1]);
	});

	it("leaves a single file as an unpinned preview, like a tree click", () => {
		const store = makeStore();
		openRequestedFilePanes(
			store,
			{ paths: ["/repo/a.ts"], target: "current-tab" },
			openVia(store),
		);
		expect(filePanesOf(store, 0).map((pane) => pane.pinned)).toEqual([false]);
	});

	it("puts every file of a new-tab request into one new tab", () => {
		const store = makeStore();
		const paneIds = openRequestedFilePanes(
			store,
			{ paths: ["/repo/a.ts", "/repo/b.ts"], target: "new-tab" },
			openVia(store),
		);
		expect(store.getState().tabs).toHaveLength(2);
		expect(filePanesOf(store, 0)).toHaveLength(0);
		expect(filePanesOf(store, 1).map((pane) => pane.id)).toEqual(paneIds);
	});

	it("scrolls the first file to the requested line", () => {
		const store = makeStore();
		openRequestedFilePanes(
			store,
			{ paths: ["/repo/a.ts", "/repo/b.ts"], line: 42, target: "current-tab" },
			openVia(store),
		);
		const [first, second] = filePanesOf(store, 0);
		expect(first?.data.pendingPosition).toEqual({
			line: 42,
			column: undefined,
		});
		expect(second?.data.pendingPosition).toBeUndefined();
	});

	it("lets the next single file replace the preview, like a tree click", () => {
		const store = makeStore();
		openRequestedFilePanes(
			store,
			{ paths: ["/repo/a.ts"], target: "current-tab" },
			openVia(store),
		);
		openRequestedFilePanes(
			store,
			{ paths: ["/repo/b.ts"], target: "current-tab" },
			openVia(store),
		);
		expect(filePanesOf(store, 0).map((pane) => pane.data.filePath)).toEqual([
			"/repo/b.ts",
		]);
	});

	it("shows the tab a single file is already open in, like a tree click", () => {
		const store = makeStore();
		openFilePaneInStore(store, "/repo/a.ts", true);
		const fileTab = store.getState().activeTabId;
		const terminalTab = store.getState().tabs[0]?.id;
		if (!fileTab || !terminalTab) throw new Error("Expected two tabs");
		store.getState().setActiveTab(terminalTab);

		openRequestedFilePanes(
			store,
			{ paths: ["/repo/a.ts"], target: "current-tab" },
			openVia(store),
		);
		expect(store.getState().activeTabId).toBe(fileTab);
		expect(store.getState().tabs).toHaveLength(2);
	});

	it("keeps several files on the destination tab when one is already open elsewhere", () => {
		const store = makeStore();
		openFilePaneInStore(store, "/repo/a.ts", true);
		const fileTab = store.getState().activeTabId;
		const terminalTab = store.getState().tabs[0]?.id;
		if (!fileTab || !terminalTab) throw new Error("Expected two tabs");
		const existing = store.getState().getActivePane()?.pane.id;
		store.getState().setActiveTab(terminalTab);

		const paneIds = openRequestedFilePanes(
			store,
			{ paths: ["/repo/a.ts", "/repo/b.ts"], target: "current-tab" },
			openVia(store),
		);
		expect(store.getState().activeTabId).toBe(terminalTab);
		expect(filePanesOf(store, 0).map((pane) => pane.data.filePath)).toEqual([
			"/repo/b.ts",
		]);
		expect(filePanesOf(store, 1).map((pane) => pane.pinned)).toEqual([false]);
		expect(paneIds[0]).toBe(existing ?? "");
		expect(paneIds).toHaveLength(2);
	});

	it("reuses a pane that already shows the file instead of duplicating it", () => {
		const store = makeStore();
		openFilePaneInStore(store, "/repo/a.ts");
		const existing = store.getState().getActivePane()?.pane.id;
		if (!existing) throw new Error("Expected an active file pane");
		const paneIds = openRequestedFilePanes(
			store,
			{ paths: ["/repo/a.ts"], target: "current-tab" },
			openVia(store),
		);
		expect(paneIds).toEqual([existing]);
		expect(filePanesOf(store, 0)).toHaveLength(1);
	});
});
