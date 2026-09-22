import { describe, expect, it } from "bun:test";
import {
	createWorkspaceStore,
	type LayoutNode,
	type WorkspaceState,
} from "@superset/panes";
import type { PagePaneData, PaneViewerData } from "../../types";
import { openPagePaneInStore } from "./openPagePaneInStore";

function pagePane(id: string, data: PagePaneData) {
	return { id, kind: "page", data: data as PaneViewerData };
}

function paneLayout(paneId: string): LayoutNode {
	return { type: "pane", paneId };
}

function workspaceState(
	pages: PagePaneData[] = [],
): WorkspaceState<PaneViewerData> {
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
					"pane-1": {
						id: "pane-1",
						kind: "terminal",
						data: { terminalId: "terminal-1" } as PaneViewerData,
					},
				},
			},
			...pages.map((page, index) => ({
				id: `page-tab-${index}`,
				createdAt: index + 2,
				activePaneId: `page-pane-${index}`,
				layout: paneLayout(`page-pane-${index}`),
				panes: {
					[`page-pane-${index}`]: pagePane(`page-pane-${index}`, page),
				},
			})),
		],
	};
}

function storeWith(pages: PagePaneData[] = []) {
	return createWorkspaceStore<PaneViewerData>({
		initialState: workspaceState(pages),
	});
}

describe("openPagePaneInStore", () => {
	it("splits the active pane when no page pane is open", () => {
		const store = storeWith();

		openPagePaneInStore(store, { slug: "report-a3f9k2" });

		const state = store.getState();
		expect(state.tabs).toHaveLength(1);
		const activeTab = state.tabs.find((tab) => tab.id === state.activeTabId);
		const panes = Object.values(activeTab?.panes ?? {});
		expect(panes).toHaveLength(2);
		const opened = panes.find((pane) => pane.kind === "page");
		expect(opened?.data).toEqual({ slug: "report-a3f9k2" } as PaneViewerData);
	});

	it('adds a new tab when placement is "tab"', () => {
		const store = storeWith();

		openPagePaneInStore(store, { slug: "report-a3f9k2" }, "tab");

		const state = store.getState();
		expect(state.tabs).toHaveLength(2);
		const activeTab = state.tabs.find((tab) => tab.id === state.activeTabId);
		const opened = Object.values(activeTab?.panes ?? {})[0];
		expect(opened?.kind).toBe("page");
		expect(opened?.data).toEqual({ slug: "report-a3f9k2" } as PaneViewerData);
	});

	it("focuses an existing pane with the same page id", () => {
		const store = storeWith([
			{ pageId: "page-1", slug: "report-a3f9k2", title: "Report" },
		]);

		openPagePaneInStore(store, {
			pageId: "page-1",
			slug: "report-a3f9k2",
			title: "Report",
		});

		const state = store.getState();
		expect(state.tabs).toHaveLength(2);
		expect(state.activeTabId).toBe("page-tab-0");
		expect(state.getTab("page-tab-0")?.activePaneId).toBe("page-pane-0");
	});

	it("focuses an existing pane by slug when the request has no page id", () => {
		const store = storeWith([
			{ pageId: "page-1", slug: "report-a3f9k2", title: "Report" },
		]);

		openPagePaneInStore(store, { slug: "report-a3f9k2" });

		const state = store.getState();
		expect(state.tabs).toHaveLength(2);
		expect(state.activeTabId).toBe("page-tab-0");
	});

	it("focuses a slug-only pane when the request carries the page id", () => {
		const store = storeWith([{ slug: "report-a3f9k2" }]);

		openPagePaneInStore(store, {
			pageId: "page-1",
			slug: "report-a3f9k2",
			title: "Report",
		});

		const state = store.getState();
		expect(state.tabs).toHaveLength(2);
		expect(state.activeTabId).toBe("page-tab-0");
	});

	it("splits the active tab for a different page", () => {
		const store = storeWith([
			{ pageId: "page-1", slug: "report-a3f9k2", title: "Report" },
		]);

		openPagePaneInStore(store, { slug: "other-b7c1z0" });

		const state = store.getState();
		expect(state.tabs).toHaveLength(2);
		const activeTab = state.tabs.find((tab) => tab.id === state.activeTabId);
		expect(Object.values(activeTab?.panes ?? {})).toHaveLength(2);
	});

	it("does not duplicate an already-open page pane", () => {
		const store = storeWith();

		openPagePaneInStore(store, { slug: "report-a3f9k2" });
		openPagePaneInStore(store, { slug: "report-a3f9k2" });

		const state = store.getState();
		expect(state.tabs).toHaveLength(1);
		const activeTab = state.tabs.find((tab) => tab.id === state.activeTabId);
		expect(Object.values(activeTab?.panes ?? {})).toHaveLength(2);
	});
});
