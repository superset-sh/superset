import { describe, expect, it } from "bun:test";
import { createWorkspaceStore } from "@superset/panes";
import type { FilePaneData, PaneViewerData } from "../../../../types";
import { openFilePaneInStore } from "./openFilePaneInStore";

function makeStore() {
	const store = createWorkspaceStore<PaneViewerData>();
	store.getState().addTab({
		panes: [{ kind: "terminal", data: { terminalId: "terminal" } }],
	});
	return store;
}

describe("openFilePaneInStore", () => {
	it.each([
		false,
		true,
	])("preserves the position when opening a file (new tab: %s)", (newTab) => {
		const store = makeStore();
		openFilePaneInStore(store, "/test.md", newTab, { line: 42, column: 7 });
		const active = store.getState().getActivePane();
		expect(active?.pane.kind).toBe("file");
		expect(active?.pane.data).toMatchObject({
			filePath: "/test.md",
			viewId: "code",
			pendingPosition: { line: 42, column: 7 },
		});
		expect(store.getState().tabs).toHaveLength(newTab ? 2 : 1);
	});
	it("navigates an existing preview in another tab without duplicating or pinning it", () => {
		const store = makeStore();
		openFilePaneInStore(store, "/test.md", true);
		const existing = store.getState().getActivePane();
		if (!existing) throw new Error("Expected an active file pane");
		store.getState().setPaneData({
			paneId: existing.pane.id,
			data: {
				...existing.pane.data,
				viewId: "markdown-preview",
				forceViewId: "markdown-preview",
			},
		});
		const firstTab = store.getState().tabs[0];
		if (!firstTab) throw new Error("Expected the terminal tab");
		store.getState().setActiveTab(firstTab.id);
		openFilePaneInStore(store, "/test.md", false, { line: 90 });
		const active = store.getState().getActivePane();
		if (!active) throw new Error("Expected an active file pane");
		expect(active.pane.id).toBe(existing.pane.id);
		expect(active.pane.pinned).toBe(existing.pane.pinned);
		expect(store.getState().tabs).toHaveLength(2);
		expect(active.pane.data).toMatchObject({
			viewId: "code",
			pendingPosition: { line: 90 },
		});
		expect((active.pane.data as FilePaneData).forceViewId).toBeUndefined();
	});
	it("creates a fresh request even for repeated clicks on the same line", () => {
		const store = makeStore();
		openFilePaneInStore(store, "/test.ts", false, { line: 42 });
		const first = (store.getState().getActivePane()?.pane.data as FilePaneData)
			.pendingPosition;
		openFilePaneInStore(store, "/test.ts", false, { line: 42 });
		const second = (store.getState().getActivePane()?.pane.data as FilePaneData)
			.pendingPosition;
		expect(second).toEqual(first);
		expect(second).not.toBe(first);
	});
	it("preserves the chosen view on ordinary file opens", () => {
		const store = makeStore();
		openFilePaneInStore(store, "/test.md");
		const active = store.getState().getActivePane();
		if (!active) throw new Error("Expected an active file pane");
		const data = { ...active.pane.data, viewId: "markdown-preview" };
		store.getState().setPaneData({ paneId: active.pane.id, data });
		openFilePaneInStore(store, "/test.md");
		expect(store.getState().getActivePane()?.pane.data).toEqual(data);
	});
	it("normalizes invalid positions before they reach the editor", () => {
		const store = makeStore();
		openFilePaneInStore(store, "/test.ts", false, { line: -3.5, column: -8 });
		expect(
			(store.getState().getActivePane()?.pane.data as FilePaneData)
				.pendingPosition,
		).toEqual({ line: 1, column: 1 });
		openFilePaneInStore(store, "/other.ts", true, { line: Number.NaN });
		expect(
			(store.getState().getActivePane()?.pane.data as FilePaneData)
				.pendingPosition,
		).toBeUndefined();
	});
});
