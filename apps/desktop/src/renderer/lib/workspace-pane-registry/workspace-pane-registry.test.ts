import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import {
	createCollection,
	localStorageCollectionOptions,
} from "@tanstack/react-db";
import {
	type WorkspaceLocalStateRow,
	workspaceLocalStateSchema,
} from "renderer/routes/_authenticated/providers/CollectionsProvider/dashboardSidebarLocal/schema";
// Imported from the impl file rather than the barrel — the test-reset
// helper is intentionally not part of the public API surface.
import {
	__resetWorkspacePaneRegistryForTests,
	getOrCreateWorkspacePaneStore,
	initWorkspacePaneRegistry,
} from "./workspace-pane-registry";

let collection: ReturnType<typeof makeCollection>;

const PROJECT_ID = crypto.randomUUID();
const WORKSPACE_ID = crypto.randomUUID();
const OTHER_WORKSPACE_ID = crypto.randomUUID();

function makeCollection() {
	// localStorage isn't available in bun:test by default; provide a shim.
	if (typeof globalThis.localStorage === "undefined") {
		const store = new Map<string, string>();
		(globalThis as { localStorage: Storage }).localStorage = {
			getItem: (k) => store.get(k) ?? null,
			setItem: (k, v) => {
				store.set(k, v);
			},
			removeItem: (k) => {
				store.delete(k);
			},
			clear: () => store.clear(),
			key: () => null,
			length: 0,
		};
	}
	return createCollection(
		localStorageCollectionOptions({
			id: `test-v2-workspace-local-state-${Math.random()}`,
			storageKey: `test-v2-workspace-local-state-${Math.random()}`,
			schema: workspaceLocalStateSchema,
			getKey: (item) => item.workspaceId,
		}),
	);
}

function seedRow(
	workspaceId: string,
	overrides: Partial<WorkspaceLocalStateRow> = {},
): void {
	collection.insert({
		workspaceId,
		createdAt: new Date(),
		sidebarState: {
			projectId: PROJECT_ID,
			tabOrder: 0,
			sectionId: null,
			changesFilter: { kind: "all" },
			activeTab: "changes",
			isHidden: false,
		},
		paneLayout: { version: 1, tabs: [], activeTabId: null },
		viewedFiles: [],
		recentlyViewedFiles: [],
		...overrides,
	});
}

beforeEach(() => {
	collection = makeCollection();
	initWorkspacePaneRegistry({ v2WorkspaceLocalState: collection });
});

afterEach(() => {
	__resetWorkspacePaneRegistryForTests();
});

describe("workspace-pane-registry", () => {
	it("returns the same store for the same workspaceId", () => {
		const a = getOrCreateWorkspacePaneStore(WORKSPACE_ID);
		const b = getOrCreateWorkspacePaneStore(WORKSPACE_ID);
		expect(a).toBe(b);
	});

	it("returns different stores for different workspaceIds", () => {
		const a = getOrCreateWorkspacePaneStore(WORKSPACE_ID);
		const b = getOrCreateWorkspacePaneStore(OTHER_WORKSPACE_ID);
		expect(a).not.toBe(b);
	});

	it("seeds the store from a pre-existing row's paneLayout", () => {
		seedRow(WORKSPACE_ID, {
			paneLayout: {
				version: 1,
				tabs: [
					{
						id: "tab-1",
						titleOverride: undefined,
						createdAt: 0,
						activePaneId: "pane-1",
						layout: { type: "pane", paneId: "pane-1" },
						panes: {
							"pane-1": {
								id: "pane-1",
								kind: "terminal",
								data: { terminalId: "t1" },
							},
						},
					},
				],
				activeTabId: "tab-1",
			},
		});

		const store = getOrCreateWorkspacePaneStore(WORKSPACE_ID);
		expect(store.getState().tabs).toHaveLength(1);
		expect(store.getState().activeTabId).toBe("tab-1");
	});

	it("writes store changes back to the row when the row exists", () => {
		seedRow(WORKSPACE_ID);
		const store = getOrCreateWorkspacePaneStore(WORKSPACE_ID);

		store.getState().addTab({
			panes: [{ kind: "terminal", data: { terminalId: "t1" } }],
		});

		const row = collection.get(WORKSPACE_ID);
		expect(row?.paneLayout.tabs).toHaveLength(1);
	});

	it("does not throw when writing back with no row present yet", () => {
		const store = getOrCreateWorkspacePaneStore(WORKSPACE_ID);
		// addTab fires the subscriber; should silently skip the write because
		// no row exists. State is preserved in-memory.
		expect(() =>
			store.getState().addTab({
				panes: [{ kind: "terminal", data: { terminalId: "t1" } }],
			}),
		).not.toThrow();
		expect(store.getState().tabs).toHaveLength(1);
	});

	it("persists pre-mount panes when the row is later inserted with empty layout", async () => {
		// Simulates the addLaunchPanes-before-route-mount flow: tabs are
		// added to the store before the workspace row exists, then
		// `ensureWorkspaceInSidebar` inserts the row with EMPTY paneLayout.
		// The registry must (a) not wipe the in-memory tabs, and (b) push
		// the store's state into the freshly-inserted row so the data
		// survives an immediate app restart.
		const store = getOrCreateWorkspacePaneStore(WORKSPACE_ID);
		store.getState().addTab({
			panes: [{ kind: "terminal", data: { terminalId: "t1" } }],
		});
		expect(store.getState().tabs).toHaveLength(1);

		seedRow(WORKSPACE_ID); // inserts with EMPTY paneLayout
		await new Promise((r) => setTimeout(r, 0));

		// Store still has the pre-mount tab.
		expect(store.getState().tabs).toHaveLength(1);
		// Row has been updated with the pre-mount tab too.
		const row = collection.get(WORKSPACE_ID);
		expect(row?.paneLayout.tabs).toHaveLength(1);
	});

	it("pushes external row updates into the store", async () => {
		seedRow(WORKSPACE_ID);
		const store = getOrCreateWorkspacePaneStore(WORKSPACE_ID);
		expect(store.getState().tabs).toHaveLength(0);

		collection.update(WORKSPACE_ID, (draft) => {
			draft.paneLayout = {
				version: 1,
				tabs: [
					{
						id: "tab-2",
						titleOverride: undefined,
						createdAt: 0,
						activePaneId: "pane-2",
						layout: { type: "pane", paneId: "pane-2" },
						panes: {
							"pane-2": {
								id: "pane-2",
								kind: "chat",
								data: { sessionId: "s1" },
							},
						},
					},
				],
				activeTabId: "tab-2",
			};
		});

		// Allow the subscribe handler to flush.
		await new Promise((r) => setTimeout(r, 0));
		expect(store.getState().tabs).toHaveLength(1);
		expect(store.getState().activeTabId).toBe("tab-2");
	});

	it("throws if used before init", () => {
		__resetWorkspacePaneRegistryForTests();
		expect(() => getOrCreateWorkspacePaneStore(WORKSPACE_ID)).toThrow(
			/not initialized/,
		);
	});
});
