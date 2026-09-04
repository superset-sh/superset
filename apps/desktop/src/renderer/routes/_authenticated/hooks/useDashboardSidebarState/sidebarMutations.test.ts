import { describe, expect, it } from "bun:test";
import {
	ensureSidebarProjectRecord,
	setSidebarProjectHidden,
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

type ProjectRow = {
	projectId: string;
	createdAt: Date;
	isCollapsed: boolean;
	isHidden: boolean;
	tabOrder: number;
	defaultOpenInApp: string | null;
};

function projectRow(
	projectId: string,
	overrides: Partial<ProjectRow> = {},
): ProjectRow {
	return {
		projectId,
		createdAt: new Date("2026-01-01T00:00:00.000Z"),
		isCollapsed: false,
		isHidden: false,
		tabOrder: 1,
		defaultOpenInApp: null,
		...overrides,
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
		v2SidebarProjects: makeCollection<ProjectRow>((row) => row.projectId),
	};
}

type Collections = ReturnType<typeof makeCollections>;

// The functions accept the real `AppCollections` Pick; our fakes implement the
// touched subset, so cast through the parameter type.
function asProjectArg(collections: Collections) {
	return collections as unknown as Parameters<
		typeof setSidebarProjectHidden
	>[0];
}
function asTombstoneArg(collections: Collections) {
	return collections as unknown as Parameters<
		typeof tombstoneSidebarWorkspaceRecord
	>[0];
}

describe("setSidebarProjectHidden", () => {
	it("flips only the hidden flag, leaving placement, sections and workspace rows intact", () => {
		const collections = makeCollections();
		collections.v2SidebarProjects.insert(
			projectRow("proj-1", { tabOrder: 3, isCollapsed: true }),
		);
		collections.v2SidebarSections.insert({
			sectionId: "sec-1",
			projectId: "proj-1",
		});
		collections.v2WorkspaceLocalState.insert(
			localStateRow("ws-1", "proj-1", { sectionId: "sec-1", pinnedAt: 5 }),
		);

		setSidebarProjectHidden(asProjectArg(collections), "proj-1", true);

		expect(collections.v2SidebarProjects.get("proj-1")).toMatchObject({
			isHidden: true,
			tabOrder: 3,
			isCollapsed: true,
		});
		expect(collections.v2SidebarSections.get("sec-1")).toBeDefined();
		expect(
			collections.v2WorkspaceLocalState.get("ws-1")?.sidebarState,
		).toMatchObject({ sectionId: "sec-1", pinnedAt: 5, isHidden: false });

		setSidebarProjectHidden(asProjectArg(collections), "proj-1", false);
		expect(collections.v2SidebarProjects.get("proj-1")?.isHidden).toBe(false);
	});

	it("is a no-op for a project with no placement row", () => {
		const collections = makeCollections();
		setSidebarProjectHidden(asProjectArg(collections), "proj-missing", true);
		expect(collections.v2SidebarProjects.state.size).toBe(0);
	});
});

describe("ensureSidebarProjectRecord", () => {
	it("reveals a hidden project instead of inserting a second row", () => {
		const collections = makeCollections();
		collections.v2SidebarProjects.insert(
			projectRow("proj-1", { isHidden: true, tabOrder: 7 }),
		);

		ensureSidebarProjectRecord(asProjectArg(collections), "proj-1");

		expect(collections.v2SidebarProjects.state.size).toBe(1);
		expect(collections.v2SidebarProjects.get("proj-1")).toMatchObject({
			isHidden: false,
			tabOrder: 7,
		});
	});

	it("inserts a visible row ahead of existing projects when none exists", () => {
		const collections = makeCollections();
		collections.v2SidebarProjects.insert(projectRow("proj-1", { tabOrder: 1 }));

		ensureSidebarProjectRecord(asProjectArg(collections), "proj-2");

		const inserted = collections.v2SidebarProjects.get("proj-2");
		expect(inserted?.isHidden).toBe(false);
		expect(inserted?.tabOrder).toBeLessThan(1);
	});

	it("leaves a visible row untouched", () => {
		const collections = makeCollections();
		collections.v2SidebarProjects.insert(
			projectRow("proj-1", { tabOrder: 4, isCollapsed: true }),
		);

		ensureSidebarProjectRecord(asProjectArg(collections), "proj-1");

		expect(collections.v2SidebarProjects.get("proj-1")).toMatchObject({
			tabOrder: 4,
			isCollapsed: true,
			isHidden: false,
		});
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
