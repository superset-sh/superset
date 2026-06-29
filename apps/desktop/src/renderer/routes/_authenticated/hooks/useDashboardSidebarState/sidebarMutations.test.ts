import { describe, expect, it } from "bun:test";
import {
	moveWorkspaceIntoSection,
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
function asMoveArg(collections: Collections) {
	return collections as unknown as Parameters<
		typeof moveWorkspaceIntoSection
	>[0];
}

/** Workspace ids in a section, ordered top-to-bottom (tabOrder ASC). */
function sectionOrder(collections: Collections, sectionId: string): string[] {
	return Array.from(collections.v2WorkspaceLocalState.state.values())
		.filter(
			(row) =>
				row.sidebarState.sectionId === sectionId &&
				row.sidebarState.isHidden !== true,
		)
		.sort((a, b) => a.sidebarState.tabOrder - b.sidebarState.tabOrder)
		.map((row) => row.workspaceId);
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

describe("moveWorkspaceIntoSection", () => {
	// Regression for #5342: "Move to group" buried the moved workspace at the
	// bottom of the target group. The most-recently-acted-on workspace should
	// stay visible at the top instead.
	it("places a moved workspace at the TOP of the target group, not the bottom", () => {
		const collections = makeCollections();
		// Two workspaces already sitting in the destination section.
		collections.v2WorkspaceLocalState.insert(
			localStateRow("ws-existing-a", "proj-1", {
				sectionId: "sec-1",
				tabOrder: 1,
			}),
		);
		collections.v2WorkspaceLocalState.insert(
			localStateRow("ws-existing-b", "proj-1", {
				sectionId: "sec-1",
				tabOrder: 2,
			}),
		);
		// The workspace being moved in, currently ungrouped.
		collections.v2WorkspaceLocalState.insert(
			localStateRow("ws-moved", "proj-1", { sectionId: null, tabOrder: 5 }),
		);

		moveWorkspaceIntoSection(
			asMoveArg(collections),
			"ws-moved",
			"proj-1",
			"sec-1",
		);

		const moved = collections.v2WorkspaceLocalState.get("ws-moved");
		expect(moved?.sidebarState.sectionId).toBe("sec-1");
		expect(moved?.sidebarState.isHidden).toBe(false);
		// Lands first, above the two existing members.
		expect(sectionOrder(collections, "sec-1")).toEqual([
			"ws-moved",
			"ws-existing-a",
			"ws-existing-b",
		]);
	});

	it("ignores hidden and other-section siblings when choosing the top slot", () => {
		const collections = makeCollections();
		collections.v2WorkspaceLocalState.insert(
			localStateRow("ws-visible", "proj-1", {
				sectionId: "sec-1",
				tabOrder: 3,
			}),
		);
		// A tombstoned row in the same section must not affect placement.
		collections.v2WorkspaceLocalState.insert(
			localStateRow("ws-hidden", "proj-1", {
				sectionId: "sec-1",
				tabOrder: -10,
				isHidden: true,
			}),
		);
		// A sibling in a different section is irrelevant.
		collections.v2WorkspaceLocalState.insert(
			localStateRow("ws-other-section", "proj-1", {
				sectionId: "sec-2",
				tabOrder: -99,
			}),
		);
		collections.v2WorkspaceLocalState.insert(
			localStateRow("ws-moved", "proj-1", { sectionId: null, tabOrder: 0 }),
		);

		moveWorkspaceIntoSection(
			asMoveArg(collections),
			"ws-moved",
			"proj-1",
			"sec-1",
		);

		const moved = collections.v2WorkspaceLocalState.get("ws-moved");
		// Below the only visible same-section sibling (tabOrder 3) -> 2.
		expect(moved?.sidebarState.tabOrder).toBe(2);
		expect(sectionOrder(collections, "sec-1")).toEqual([
			"ws-moved",
			"ws-visible",
		]);
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
