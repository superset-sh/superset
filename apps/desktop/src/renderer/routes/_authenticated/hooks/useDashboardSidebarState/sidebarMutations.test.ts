import { describe, expect, it } from "bun:test";
import {
	removeProjectFromSidebarState,
	type SidebarWorkspaceRow,
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
		pinnedAt: number | null;
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
			pinnedAt: null,
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

const LOCAL_HOST = "host-local";
const ME = "user-me";
const PLACEMENT = { machineId: LOCAL_HOST, currentUserId: ME };

describe("removeProjectFromSidebarState", () => {
	it("tombstones the project's worktrees — existing rows and row-less ones — and deletes sections and the project record", () => {
		const collections = makeCollections();
		// Explicitly-placed worktree (has a visible local-state row).
		collections.v2WorkspaceLocalState.insert(
			localStateRow("ws-placed", "proj-1", { sectionId: "sec-1" }),
		);
		const workspaces: SidebarWorkspaceRow[] = [
			{
				id: "ws-placed",
				projectId: "proj-1",
				type: "worktree",
				hostId: LOCAL_HOST,
				createdByUserId: null,
			},
			// Worktree with no row yet — the reconciler would re-pin it.
			{
				id: "ws-rowless",
				projectId: "proj-1",
				type: "worktree",
				hostId: LOCAL_HOST,
				createdByUserId: null,
			},
		];
		collections.v2SidebarSections.insert({
			sectionId: "sec-1",
			projectId: "proj-1",
		});
		collections.v2SidebarProjects.insert({ projectId: "proj-1" });

		const cleaned: string[] = [];
		removeProjectFromSidebarState(
			asRemoveArg(collections),
			workspaces,
			"proj-1",
			PLACEMENT,
			(rows) => {
				for (const row of rows) cleaned.push(String(row.workspaceId));
			},
		);

		// Existing row hidden (kept); row-less worktree gets an inserted tombstone.
		expect(
			collections.v2WorkspaceLocalState.get("ws-placed")?.sidebarState.isHidden,
		).toBe(true);
		expect(
			collections.v2WorkspaceLocalState.get("ws-rowless")?.sidebarState
				.isHidden,
		).toBe(true);
		expect(collections.v2SidebarSections.get("sec-1")).toBeUndefined();
		expect(collections.v2SidebarProjects.get("proj-1")).toBeUndefined();
		// Only the pre-existing row had live runtimes to tear down.
		expect(cleaned).toEqual(["ws-placed"]);
	});

	it("leaves the project's main workspace alone so re-adding the project restores it", () => {
		const collections = makeCollections();
		collections.v2WorkspaceLocalState.insert(
			localStateRow("ws-main", "proj-1"),
		);
		const workspaces: SidebarWorkspaceRow[] = [
			{
				id: "ws-main",
				projectId: "proj-1",
				type: "main",
				hostId: LOCAL_HOST,
				createdByUserId: null,
			},
			{
				id: "ws-main-rowless",
				projectId: "proj-1",
				type: "main",
				hostId: LOCAL_HOST,
				createdByUserId: null,
			},
		];
		collections.v2SidebarProjects.insert({ projectId: "proj-1" });

		removeProjectFromSidebarState(
			asRemoveArg(collections),
			workspaces,
			"proj-1",
			PLACEMENT,
			noopCleanup,
		);

		// Main row untouched (not hidden); no tombstone created for a row-less main.
		expect(
			collections.v2WorkspaceLocalState.get("ws-main")?.sidebarState.isHidden,
		).toBe(false);
		expect(
			collections.v2WorkspaceLocalState.get("ws-main-rowless"),
		).toBeUndefined();
		expect(collections.v2SidebarProjects.get("proj-1")).toBeUndefined();
	});

	it("clears the pin on a kept main-workspace row so it can't become an invisible orphan", () => {
		// A pinned row is excluded from the project tree, and once the project
		// record is deleted the pinned section drops it too — with the pin left
		// set, the workspace would vanish with no context menu to unpin it.
		const collections = makeCollections();
		collections.v2WorkspaceLocalState.insert(
			localStateRow("ws-main", "proj-1", { pinnedAt: 1753000000000 }),
		);
		const workspaces: SidebarWorkspaceRow[] = [
			{
				id: "ws-main",
				projectId: "proj-1",
				type: "main",
				hostId: LOCAL_HOST,
				createdByUserId: null,
			},
		];
		collections.v2SidebarProjects.insert({ projectId: "proj-1" });

		removeProjectFromSidebarState(
			asRemoveArg(collections),
			workspaces,
			"proj-1",
			PLACEMENT,
			noopCleanup,
		);

		const row = collections.v2WorkspaceLocalState.get("ws-main");
		expect(row?.sidebarState.pinnedAt).toBeNull();
		// Still not hidden — re-adding the project restores the main workspace.
		expect(row?.sidebarState.isHidden).toBe(false);
	});

	it("leaves workspaces from other projects untouched", () => {
		const collections = makeCollections();
		collections.v2WorkspaceLocalState.insert(
			localStateRow("ws-other", "proj-2"),
		);
		const workspaces: SidebarWorkspaceRow[] = [
			{
				id: "ws-other",
				projectId: "proj-2",
				type: "worktree",
				hostId: LOCAL_HOST,
				createdByUserId: null,
			},
		];
		collections.v2SidebarProjects.insert({ projectId: "proj-1" });

		removeProjectFromSidebarState(
			asRemoveArg(collections),
			workspaces,
			"proj-1",
			PLACEMENT,
			noopCleanup,
		);

		expect(
			collections.v2WorkspaceLocalState.get("ws-other")?.sidebarState.isHidden,
		).toBe(false);
	});

	it("tombstones a row-less remote worktree this user created, even if its host is offline (#7100)", () => {
		const collections = makeCollections();
		// No local-state row: the reconciler would re-place it (recreating the
		// project row) the moment its host answers — even a host that is offline
		// at removal time — so the tombstone must be written regardless of host.
		const workspaces: SidebarWorkspaceRow[] = [
			{
				id: "ws-remote-mine",
				projectId: "proj-1",
				type: "worktree",
				hostId: "host-remote",
				createdByUserId: ME,
			},
		];
		collections.v2SidebarProjects.insert({ projectId: "proj-1" });

		const cleaned: string[] = [];
		removeProjectFromSidebarState(
			asRemoveArg(collections),
			workspaces,
			"proj-1",
			PLACEMENT,
			(rows) => {
				for (const row of rows) cleaned.push(String(row.workspaceId));
			},
		);

		expect(
			collections.v2WorkspaceLocalState.get("ws-remote-mine")?.sidebarState
				.isHidden,
		).toBe(true);
		// A row-less remote worktree had no pane runtimes on this device.
		expect(cleaned).toEqual([]);
	});

	it("writes no tombstone for a teammate's or creator-less remote worktree — placement never brings those back", () => {
		const collections = makeCollections();
		const workspaces: SidebarWorkspaceRow[] = [
			{
				id: "ws-remote-theirs",
				projectId: "proj-1",
				type: "worktree",
				hostId: "host-remote",
				createdByUserId: "user-teammate",
			},
			{
				id: "ws-remote-unknown",
				projectId: "proj-1",
				type: "worktree",
				hostId: "host-remote",
				createdByUserId: null,
			},
			// Local host: placed whoever created it, so still tombstoned.
			{
				id: "ws-local-theirs",
				projectId: "proj-1",
				type: "worktree",
				hostId: LOCAL_HOST,
				createdByUserId: "user-teammate",
			},
		];
		collections.v2SidebarProjects.insert({ projectId: "proj-1" });

		removeProjectFromSidebarState(
			asRemoveArg(collections),
			workspaces,
			"proj-1",
			PLACEMENT,
			noopCleanup,
		);

		expect(collections.v2WorkspaceLocalState.get("ws-remote-theirs")).toBe(
			undefined,
		);
		expect(collections.v2WorkspaceLocalState.get("ws-remote-unknown")).toBe(
			undefined,
		);
		expect(
			collections.v2WorkspaceLocalState.get("ws-local-theirs")?.sidebarState
				.isHidden,
		).toBe(true);
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

	it("hides an existing row, clears its section and pin, and runs pane cleanup", () => {
		const collections = makeCollections();
		collections.v2WorkspaceLocalState.insert(
			localStateRow("ws-1", "proj-1", {
				sectionId: "sec-1",
				pinnedAt: 1753000000000,
			}),
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
		expect(row?.sidebarState.pinnedAt).toBeNull();
		expect(cleaned).toEqual(["ws-1"]);
	});
});
