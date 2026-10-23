import { afterEach, describe, expect, test } from "bun:test";
import { createWorkspaceStore, type WorkspaceState } from "@superset/panes";
import type { PaneViewerData } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/types";
import type { AppCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider/collections";
import { registerV2PaneLayoutStore } from "renderer/stores/v2-pane-layout-stores";
import {
	applyRememberedV2PaneSelection,
	clearRememberedV2PaneSelectionsForTest,
} from "renderer/stores/v2-pane-selection";
import { openBackgroundBrowser } from "./openBackgroundBrowser";

function fixture() {
	const store = createWorkspaceStore<PaneViewerData>();
	store.getState().addTab({
		panes: [{ kind: "terminal", data: { terminalId: "working-terminal" } }],
	});
	const state = store.getState();
	const initial: WorkspaceState<PaneViewerData> = {
		version: 1,
		tabs: state.tabs,
		activeTabId: state.activeTabId,
	};
	const rows = new Map([
		["agent", { paneLayout: structuredClone(initial) }],
		["user", { paneLayout: structuredClone(initial) }],
	]);
	const collections = {
		v2WorkspaceLocalState: {
			get: (id: string) => rows.get(id),
			update: (
				id: string,
				update: (row: { paneLayout: WorkspaceState<PaneViewerData> }) => void,
			) => {
				const row = rows.get(id);
				if (row) update(row);
			},
		},
	} as unknown as Pick<AppCollections, "v2WorkspaceLocalState">;
	return { collections, rows, initial };
}

afterEach(clearRememberedV2PaneSelectionsForTest);

describe("openBackgroundBrowser", () => {
	for (const target of ["current-tab", "new-tab"] as const) {
		test(`${target} adds an addressable browser without changing existing selections or another workspace`, () => {
			const { collections, rows, initial } = fixture();
			const paneId = openBackgroundBrowser({
				collections,
				workspaceId: "agent",
				url: "https://example.com",
				target,
			});
			const layout = rows.get("agent")?.paneLayout;
			expect(rows.get("user")?.paneLayout).toEqual(initial);
			if (!layout) throw new Error("Missing layout");
			expect(layout.activeTabId).toBe(initial.activeTabId);
			expect(layout.tabs[0].activePaneId).toBe(initial.tabs[0].activePaneId);
			const pane = layout.tabs
				.flatMap((tab) => Object.values(tab.panes))
				.find((pane) => pane.id === paneId);
			expect(pane?.kind).toBe("browser");
			expect(pane?.data).toEqual({ url: "https://example.com" });
			expect(layout.tabs.length).toBe(target === "new-tab" ? 2 : 1);
		});
	}
	test("successive opens return distinct panes and retain both new tabs", () => {
		const { collections, rows } = fixture();
		const request = {
			collections,
			workspaceId: "agent",
			url: "https://example.com",
			target: "new-tab" as const,
		};
		const first = openBackgroundBrowser(request);
		const second = openBackgroundBrowser(request);
		expect(first).not.toBe(second);
		expect(rows.get("agent")?.paneLayout.tabs).toHaveLength(3);
	});
	test("activate makes the new tab active in its workspace only", () => {
		const { collections, rows, initial } = fixture();
		const paneId = openBackgroundBrowser({
			collections,
			workspaceId: "agent",
			url: "https://example.com",
			target: "new-tab",
			activate: true,
		});
		const layout = rows.get("agent")?.paneLayout;
		if (!layout) throw new Error("Missing layout");
		const tab = layout.tabs.find((tab) => tab.panes[paneId]);
		if (!tab) throw new Error("Missing tab");
		expect(layout.activeTabId).toBe(tab.id);
		expect(tab.activePaneId).toBe(paneId);
		expect(applyRememberedV2PaneSelection("agent", layout).activeTabId).toBe(
			tab.id,
		);
		expect(rows.get("user")?.paneLayout).toEqual(initial);
	});
	test("activate shows the new tab in a mounted workspace", () => {
		const { collections, initial } = fixture();
		const mounted = createWorkspaceStore<PaneViewerData>({
			initialState: structuredClone(initial),
		});
		const unregister = registerV2PaneLayoutStore("agent", mounted);
		try {
			const paneId = openBackgroundBrowser({
				collections,
				workspaceId: "agent",
				url: "https://example.com",
				target: "new-tab",
				activate: true,
			});
			const { tabs, activeTabId } = mounted.getState();
			expect(tabs.find((tab) => tab.id === activeTabId)?.activePaneId).toBe(
				paneId,
			);
		} finally {
			unregister();
		}
	});
});
