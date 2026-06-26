import { describe, expect, it } from "bun:test";
import {
	removeProjectFromSidebarState,
	tombstoneSidebarWorkspaceRecord,
} from "./sidebarMutations";

/**
 * Minimal in-memory stand-in for a TanStack DB collection, implementing only
 * the surface the sidebar mutations touch (`get`/`insert`/`update`/`delete`
 * plus a `.state` Map).
 */
function makeCollection<T>(getKey: (item: T) => string) {
	const state = new Map<string, T>();
	return {
		state,
		get: (key: string) => state.get(key),
		insert: (item: T) => {
			state.set(getKey(item), structuredClone(item));
		},
		update: (key: string, producer: (draft: T) => void) => {
			const existing = state.get(key);
			if (!existing) return;
			const draft = structuredClone(existing);
			producer(draft);
			state.set(key, draft);
		},
		delete: (keys: string | string[]) => {
			for (const key of Array.isArray(keys) ? keys : [keys]) {
				state.delete(key);
			}
		},
	};
}

type LocalStateRow = {
	workspaceId: string;
	createdAt: Date;
	sidebarState: {
		projectId: string;
		tabOrder: number;
		sectionId: string | null;
		isHidden: boolean;
	};
	paneLayout: { version: number; tabs: unknown[]; activeTabId: string | null };
};

function localStateRow(
	workspaceId: string,
	projectId: string,
	overrides: Partial<LocalStateRow["sidebarState"]> = {},
): LocalStateRow {
	return {
		workspaceId,
		createdAt: new Date("2026-01-01T00:00:00.000Z"),
		sidebarState: {
			projectId,
			tabOrder: 1,
			sectionId: null,
			isHidden: false,
			...overrides,
		},
		paneLayout: { version: 1, tabs: [], activeTabId: null },
	};
}

function makeCollections() {
	return {
		v2WorkspaceLocalState: makeCollection<LocalStateRow>(
			(row) => row.workspaceId,
		),
		v2Workspaces: makeCollection<{
			id: string;
			projectId: string;
			hostId: string;
		}>((row) => row.id),
		v2SidebarSections: makeCollection<{
			sectionId: string;
			projectId: string;
		}>((row) => row.sectionId),
		v2SidebarProjects: makeCollection<{ projectId: string }>(
			(row) => row.projectId,
		),
	};
}

type Collections = ReturnType<typeof makeCollections>;

// The functions accept the real `AppCollections` Pick; our fakes implement the
// touched subset, so cast through the parameter type.
function asRemoveArg(collections: Collections) {
	return collections as unknown as Parameters<
		typeof removeProjectFromSidebarState
	>[0];
}
function asTombstoneArg(collections: Collections) {
	return collections as unknown as Parameters<
		typeof tombstoneSidebarWorkspaceRecord
	>[0];
}

const noopCleanup = () => {};

/** Mirrors `useAutoAddLocalWorkspacesToSidebar`: re-pins this-machine workspaces with no local-state row. */
function workspacesAutoAddWouldRepin(
	collections: Collections,
	machineId: string,
): string[] {
	const known = new Set(collections.v2WorkspaceLocalState.state.keys());
	return Array.from(collections.v2Workspaces.state.values())
		.filter((w) => w.hostId === machineId && !known.has(w.id))
		.map((w) => w.id);
}

describe("removeProjectFromSidebarState", () => {
	it("keeps an auto-included main workspace removed (no local-state row) so the auto-add hook can't re-pin it", () => {
		const collections = makeCollections();
		collections.v2Workspaces.insert({
			id: "ws-main",
			projectId: "proj-1",
			hostId: "machine-1",
		});
		collections.v2SidebarProjects.insert({ projectId: "proj-1" });

		removeProjectFromSidebarState(
			asRemoveArg(collections),
			"proj-1",
			"machine-1",
			noopCleanup,
		);

		// Project record gone -> project no longer rendered.
		expect(collections.v2SidebarProjects.get("proj-1")).toBeUndefined();
		// A tombstone row now exists for the previously row-less main workspace.
		const tombstone = collections.v2WorkspaceLocalState.get("ws-main");
		expect(tombstone?.sidebarState.isHidden).toBe(true);
		// Regression guard: the auto-add hook would NOT re-pin it.
		expect(workspacesAutoAddWouldRepin(collections, "machine-1")).toEqual([]);
	});

	it("tombstones an explicitly-placed workspace and deletes the project's sections and record", () => {
		const collections = makeCollections();
		collections.v2WorkspaceLocalState.insert(
			localStateRow("ws-1", "proj-1", { sectionId: "sec-1", tabOrder: 3 }),
		);
		collections.v2Workspaces.insert({
			id: "ws-1",
			projectId: "proj-1",
			hostId: "machine-1",
		});
		collections.v2SidebarSections.insert({
			sectionId: "sec-1",
			projectId: "proj-1",
		});
		collections.v2SidebarProjects.insert({ projectId: "proj-1" });

		const cleaned: string[] = [];
		removeProjectFromSidebarState(
			asRemoveArg(collections),
			"proj-1",
			"machine-1",
			(rows) => {
				for (const row of rows) cleaned.push(String(row.workspaceId));
			},
		);

		const row = collections.v2WorkspaceLocalState.get("ws-1");
		expect(row?.sidebarState.isHidden).toBe(true);
		expect(row?.sidebarState.sectionId).toBeNull();
		expect(collections.v2SidebarSections.get("sec-1")).toBeUndefined();
		expect(collections.v2SidebarProjects.get("proj-1")).toBeUndefined();
		// Existing rows have their pane runtimes cleaned up.
		expect(cleaned).toEqual(["ws-1"]);
	});

	it("leaves workspaces from other projects and other hosts untouched", () => {
		const collections = makeCollections();
		collections.v2WorkspaceLocalState.insert(
			localStateRow("ws-other", "proj-2"),
		);
		collections.v2Workspaces.insert({
			id: "ws-other",
			projectId: "proj-2",
			hostId: "machine-1",
		});
		// Same project, different host, no local-state row -> must not be tombstoned.
		collections.v2Workspaces.insert({
			id: "ws-remote",
			projectId: "proj-1",
			hostId: "machine-2",
		});
		collections.v2SidebarProjects.insert({ projectId: "proj-1" });

		removeProjectFromSidebarState(
			asRemoveArg(collections),
			"proj-1",
			"machine-1",
			noopCleanup,
		);

		expect(
			collections.v2WorkspaceLocalState.get("ws-other")?.sidebarState.isHidden,
		).toBe(false);
		expect(collections.v2WorkspaceLocalState.get("ws-remote")).toBeUndefined();
	});
});

describe("tombstoneSidebarWorkspaceRecord", () => {
	it("inserts a hidden row when none exists and does not run pane cleanup", () => {
		const collections = makeCollections();
		const cleaned: string[] = [];

		tombstoneSidebarWorkspaceRecord(
			asTombstoneArg(collections),
			"ws-new",
			"proj-1",
			(rows) => {
				for (const row of rows) cleaned.push(String(row.workspaceId));
			},
		);

		expect(
			collections.v2WorkspaceLocalState.get("ws-new")?.sidebarState.isHidden,
		).toBe(true);
		expect(cleaned).toEqual([]);
	});

	it("hides an existing row, clears its section, and runs pane cleanup", () => {
		const collections = makeCollections();
		collections.v2WorkspaceLocalState.insert(
			localStateRow("ws-1", "proj-1", { sectionId: "sec-1" }),
		);
		const cleaned: string[] = [];

		tombstoneSidebarWorkspaceRecord(
			asTombstoneArg(collections),
			"ws-1",
			"proj-1",
			(rows) => {
				for (const row of rows) cleaned.push(String(row.workspaceId));
			},
		);

		const row = collections.v2WorkspaceLocalState.get("ws-1");
		expect(row?.sidebarState.isHidden).toBe(true);
		expect(row?.sidebarState.sectionId).toBeNull();
		expect(cleaned).toEqual(["ws-1"]);
	});
});
