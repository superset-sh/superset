import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import {
	createCollection,
	localStorageCollectionOptions,
} from "@tanstack/react-db";
import type {
	ChatPaneData,
	TerminalPaneData,
} from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/types";
import {
	type WorkspaceLocalStateRow,
	workspaceLocalStateSchema,
} from "renderer/routes/_authenticated/providers/CollectionsProvider/dashboardSidebarLocal/schema";
import { addLaunchPanes } from "./addLaunchPanes";
// Imported from the impl file rather than the barrel — the test-reset
// helper is intentionally not part of the public API surface.
import {
	__resetWorkspacePaneRegistryForTests,
	getOrCreateWorkspacePaneStore,
	initWorkspacePaneRegistry,
} from "./workspace-pane-registry";

const PROJECT_ID = crypto.randomUUID();
const WORKSPACE_ID = crypto.randomUUID();

let collection: ReturnType<typeof makeCollection>;

function makeCollection() {
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
	seedRow(WORKSPACE_ID);
});

afterEach(() => {
	__resetWorkspacePaneRegistryForTests();
});

describe("addLaunchPanes", () => {
	it("is a no-op for an empty array", () => {
		addLaunchPanes(WORKSPACE_ID, []);
		const store = getOrCreateWorkspacePaneStore(WORKSPACE_ID);
		expect(store.getState().tabs).toHaveLength(0);
	});

	it("adds a tab per terminal launch with no initialCommand", () => {
		addLaunchPanes(WORKSPACE_ID, [
			{ kind: "terminal", terminalId: "t-1", label: "Codex" },
			{ kind: "terminal", terminalId: "t-2" },
		]);
		const store = getOrCreateWorkspacePaneStore(WORKSPACE_ID);
		expect(store.getState().tabs).toHaveLength(2);
		const all = store.getState().tabs.flatMap((t) => Object.values(t.panes));
		expect(all).toHaveLength(2);
		for (const pane of all) {
			expect(pane.kind).toBe("terminal");
			const data = pane.data as TerminalPaneData;
			expect(data.terminalId).toMatch(/^t-/);
			expect(data.initialCommand).toBeUndefined();
		}
	});

	it("adds a tab per chat launch", () => {
		addLaunchPanes(WORKSPACE_ID, [
			{ kind: "chat", chatSessionId: "s-1", label: "Claude" },
		]);
		const store = getOrCreateWorkspacePaneStore(WORKSPACE_ID);
		const tab = store.getState().tabs[0];
		expect(tab).toBeDefined();
		const pane = Object.values(tab?.panes)[0];
		expect(pane?.kind).toBe("chat");
		const data = pane?.data as ChatPaneData;
		expect(data.sessionId).toBe("s-1");
	});

	it("dedupes by terminalId on repeat calls", () => {
		addLaunchPanes(WORKSPACE_ID, [{ kind: "terminal", terminalId: "t-1" }]);
		addLaunchPanes(WORKSPACE_ID, [{ kind: "terminal", terminalId: "t-1" }]);
		const store = getOrCreateWorkspacePaneStore(WORKSPACE_ID);
		expect(store.getState().tabs).toHaveLength(1);
	});

	it("dedupes by chatSessionId on repeat calls", () => {
		addLaunchPanes(WORKSPACE_ID, [{ kind: "chat", chatSessionId: "s-1" }]);
		addLaunchPanes(WORKSPACE_ID, [{ kind: "chat", chatSessionId: "s-1" }]);
		const store = getOrCreateWorkspacePaneStore(WORKSPACE_ID);
		expect(store.getState().tabs).toHaveLength(1);
	});

	it("focuses the existing pane when called with a duplicate id", () => {
		addLaunchPanes(WORKSPACE_ID, [
			{ kind: "terminal", terminalId: "t-1" },
			{ kind: "terminal", terminalId: "t-2" },
		]);
		const store = getOrCreateWorkspacePaneStore(WORKSPACE_ID);
		const firstTabId = store.getState().tabs[0]?.id;
		if (!firstTabId) throw new Error("expected at least one tab to be added");

		addLaunchPanes(WORKSPACE_ID, [{ kind: "terminal", terminalId: "t-1" }]);
		expect(store.getState().activeTabId).toBe(firstTabId);
	});

	it("handles a mixed terminal + chat batch", () => {
		addLaunchPanes(WORKSPACE_ID, [
			{ kind: "terminal", terminalId: "t-1" },
			{ kind: "chat", chatSessionId: "s-1" },
		]);
		const store = getOrCreateWorkspacePaneStore(WORKSPACE_ID);
		const kinds = store
			.getState()
			.tabs.flatMap((t) => Object.values(t.panes).map((p) => p.kind))
			.sort();
		expect(kinds).toEqual(["chat", "terminal"]);
	});
});
