import { describe, expect, it } from "bun:test";
import {
	createWorkspaceStore,
	type Pane,
	type WorkspaceState,
} from "@superset/panes";
import type { PaneViewerData } from "../../types";
import { openUrlInRightPane } from "./openUrlInRightPane";

function tab(id: string, pane: Pane<PaneViewerData>) {
	return {
		id,
		createdAt: 1,
		activePaneId: pane.id,
		layout: { type: "pane" as const, paneId: pane.id },
		panes: { [pane.id]: pane },
	};
}

function browser(id: string, url: string, pinned = false) {
	return { id, kind: "browser", pinned, data: { url } as PaneViewerData };
}

function storeWith(tabs: ReturnType<typeof tab>[]) {
	const initialState: WorkspaceState<PaneViewerData> = {
		version: 1,
		activeTabId: tabs[0]?.id ?? null,
		tabs,
	};
	return createWorkspaceStore<PaneViewerData>({ initialState });
}

function browserUrls(store: ReturnType<typeof storeWith>) {
	return store
		.getState()
		.tabs.flatMap((t) => Object.values(t.panes))
		.filter((pane) => pane.kind === "browser")
		.map((pane) => (pane.data as { url: string }).url);
}

describe("openUrlInRightPane", () => {
	it("adds a browser tab when the area is empty", () => {
		const store = storeWith([]);

		openUrlInRightPane(store, "https://example.com");

		expect(store.getState().tabs).toHaveLength(1);
		expect(browserUrls(store)).toEqual(["https://example.com"]);
	});

	it("reuses an unpinned browser in another tab and activates that tab", () => {
		const store = storeWith([
			tab("tab-1", {
				id: "chat",
				kind: "chat",
				data: {} as PaneViewerData,
			}),
			tab("tab-2", browser("b1", "https://old.example.com")),
		]);

		openUrlInRightPane(store, "https://new.example.com");

		expect(store.getState().tabs).toHaveLength(2);
		expect(store.getState().activeTabId).toBe("tab-2");
		expect(browserUrls(store)).toEqual(["https://new.example.com"]);
	});

	it("leaves a pinned browser alone and adds a tab", () => {
		const store = storeWith([
			tab("tab-1", browser("b1", "https://pinned.example.com", true)),
		]);

		openUrlInRightPane(store, "https://new.example.com");

		expect(store.getState().tabs).toHaveLength(2);
		expect(browserUrls(store)).toEqual([
			"https://pinned.example.com",
			"https://new.example.com",
		]);
	});
});
