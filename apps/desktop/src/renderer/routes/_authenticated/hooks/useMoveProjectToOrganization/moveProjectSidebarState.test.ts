import { describe, expect, it } from "bun:test";
import type { AppCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider/collections";
import {
	applyProjectSidebarState,
	collectProjectSidebarState,
} from "./moveProjectSidebarState";

type SidebarCollections = Pick<
	AppCollections,
	"v2SidebarProjects" | "v2SidebarSections" | "v2WorkspaceLocalState"
>;

/**
 * Minimal stand-in for a TanStack localStorage collection: the move only uses
 * `get`, `insert` and iteration over `state`.
 */
function createCollection<T>(key: (row: T) => string, rows: T[] = []) {
	const state = new Map<string, T>(rows.map((row) => [key(row), row]));
	return {
		state,
		get: (id: string) => state.get(id),
		insert: (row: T) => {
			state.set(key(row), row);
		},
		update: (id: string, mutate: (draft: T) => void) => {
			const row = state.get(id);
			if (!row) return;
			const draft = structuredClone(row);
			mutate(draft);
			state.set(id, draft);
		},
	};
}

/** Seeds a fixture row past the collection's stricter insert typing. */
function insertRow(collection: { insert: (row: never) => void }, row: unknown) {
	collection.insert(row as never);
}

const PROJECT_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_PROJECT_ID = "22222222-2222-4222-8222-222222222222";
const SECTION_ID = "33333333-3333-4333-8333-333333333333";
const WORKSPACE_ID = "44444444-4444-4444-8444-444444444444";
const HIDDEN_WORKSPACE_ID = "55555555-5555-4555-8555-555555555555";

function workspaceRow(
	workspaceId: string,
	overrides: Partial<{
		projectId: string;
		sectionId: string | null;
		isHidden: boolean;
		pinnedAt: number | null;
		tabOrder: number;
	}> = {},
) {
	return {
		workspaceId,
		createdAt: new Date("2026-01-01T00:00:00.000Z"),
		sidebarState: {
			projectId: overrides.projectId ?? PROJECT_ID,
			tabOrder: overrides.tabOrder ?? 1,
			sectionId: overrides.sectionId ?? null,
			changesFilter: { kind: "all" as const },
			changesViewMode: "folders" as const,
			activeTab: "changes" as const,
			isHidden: overrides.isHidden ?? false,
			pinnedAt: overrides.pinnedAt ?? null,
		},
		paneLayout: { version: 1, tabs: [], activeTabId: null },
		viewedFiles: [],
		recentlyViewedFiles: [],
		workspaceRunTerminals: {},
		pendingMigratedTerminals: [],
	};
}

function sectionRow(sectionId: string, projectId = PROJECT_ID) {
	return {
		sectionId,
		projectId,
		name: "Agents",
		createdAt: new Date("2026-01-01T00:00:00.000Z"),
		tabOrder: 2,
		isCollapsed: false,
		color: "#ff0000",
	};
}

function projectRow(projectId = PROJECT_ID, tabOrder = 7) {
	return {
		projectId,
		createdAt: new Date("2026-01-01T00:00:00.000Z"),
		isCollapsed: true,
		tabOrder,
		defaultOpenInApp: "cursor",
	};
}

function createSource(): SidebarCollections {
	return {
		v2SidebarProjects: createCollection(
			(row) => row.projectId,
			[projectRow(), projectRow(OTHER_PROJECT_ID, 1)],
		),
		v2SidebarSections: createCollection(
			(row) => row.sectionId,
			[sectionRow(SECTION_ID)],
		),
		v2WorkspaceLocalState: createCollection(
			(row) => row.workspaceId,
			[
				workspaceRow(WORKSPACE_ID, { sectionId: SECTION_ID, pinnedAt: 500 }),
				workspaceRow(HIDDEN_WORKSPACE_ID, { isHidden: true }),
				workspaceRow("66666666-6666-4666-8666-666666666666", {
					projectId: OTHER_PROJECT_ID,
				}),
			],
		),
	} as unknown as SidebarCollections;
}

function createEmptyTarget(): SidebarCollections {
	return {
		v2SidebarProjects: createCollection(
			(row: ReturnType<typeof projectRow>) => row.projectId,
		),
		v2SidebarSections: createCollection(
			(row: ReturnType<typeof sectionRow>) => row.sectionId,
		),
		v2WorkspaceLocalState: createCollection(
			(row: ReturnType<typeof workspaceRow>) => row.workspaceId,
		),
	} as unknown as SidebarCollections;
}

describe("collectProjectSidebarState", () => {
	it("takes only the rows belonging to the project", () => {
		const state = collectProjectSidebarState(createSource(), PROJECT_ID);

		expect(state.project?.projectId).toBe(PROJECT_ID);
		expect(state.sections.map((s) => s.sectionId)).toEqual([SECTION_ID]);
		expect(state.workspaces.map((w) => w.workspaceId).sort()).toEqual(
			[WORKSPACE_ID, HIDDEN_WORKSPACE_ID].sort(),
		);
	});

	it("reports a missing project row rather than throwing", () => {
		const state = collectProjectSidebarState(createEmptyTarget(), PROJECT_ID);

		expect(state.project).toBeNull();
		expect(state.sections).toEqual([]);
		expect(state.workspaces).toEqual([]);
	});
});

describe("applyProjectSidebarState", () => {
	it("carries the project, its sections and its visible workspaces across", () => {
		const target = createEmptyTarget();
		applyProjectSidebarState(
			target,
			PROJECT_ID,
			collectProjectSidebarState(createSource(), PROJECT_ID),
		);

		expect(target.v2SidebarProjects.get(PROJECT_ID)?.isCollapsed).toBe(true);
		expect(target.v2SidebarProjects.get(PROJECT_ID)?.defaultOpenInApp).toBe(
			"cursor",
		);
		// Section ids must survive — workspace rows reference them by id.
		expect(target.v2SidebarSections.get(SECTION_ID)?.name).toBe("Agents");
		expect(
			target.v2WorkspaceLocalState.get(WORKSPACE_ID)?.sidebarState.sectionId,
		).toBe(SECTION_ID);
	});

	it("leaves hidden tombstones behind", () => {
		const target = createEmptyTarget();
		applyProjectSidebarState(
			target,
			PROJECT_ID,
			collectProjectSidebarState(createSource(), PROJECT_ID),
		);

		expect(
			target.v2WorkspaceLocalState.get(HIDDEN_WORKSPACE_ID),
		).toBeUndefined();
	});

	it("positions the project against the target org, not the source", () => {
		const target = createEmptyTarget();
		insertRow(target.v2SidebarProjects, projectRow(OTHER_PROJECT_ID, 4));

		applyProjectSidebarState(
			target,
			PROJECT_ID,
			collectProjectSidebarState(createSource(), PROJECT_ID),
		);

		expect(target.v2SidebarProjects.get(PROJECT_ID)?.tabOrder).toBe(5);
	});

	it("re-bases a pin above the target org's existing pins", () => {
		const target = createEmptyTarget();
		insertRow(
			target.v2WorkspaceLocalState,
			workspaceRow("77777777-7777-4777-8777-777777777777", {
				projectId: OTHER_PROJECT_ID,
				pinnedAt: Number.MAX_SAFE_INTEGER - 10,
			}),
		);

		applyProjectSidebarState(
			target,
			PROJECT_ID,
			collectProjectSidebarState(createSource(), PROJECT_ID),
		);

		const moved = target.v2WorkspaceLocalState.get(WORKSPACE_ID);
		expect(moved?.sidebarState.pinnedAt).toBe(Number.MAX_SAFE_INTEGER - 9);
	});

	it("un-hides a tombstone left by an earlier move out of this org", () => {
		const target = createEmptyTarget();
		insertRow(
			target.v2WorkspaceLocalState,
			workspaceRow(WORKSPACE_ID, { isHidden: true, pinnedAt: null }),
		);

		applyProjectSidebarState(
			target,
			PROJECT_ID,
			collectProjectSidebarState(createSource(), PROJECT_ID),
		);

		const healed = target.v2WorkspaceLocalState.get(WORKSPACE_ID);
		expect(healed?.sidebarState.isHidden).toBe(false);
		expect(healed?.sidebarState.sectionId).toBe(SECTION_ID);
	});

	it("is idempotent — a retried move keeps the target's own values", () => {
		const source = createSource();
		const target = createEmptyTarget();
		const state = collectProjectSidebarState(source, PROJECT_ID);

		applyProjectSidebarState(target, PROJECT_ID, state);
		const firstTabOrder = target.v2SidebarProjects.get(PROJECT_ID)?.tabOrder;
		applyProjectSidebarState(target, PROJECT_ID, state);

		expect(target.v2SidebarProjects.get(PROJECT_ID)?.tabOrder).toBe(
			firstTabOrder,
		);
		expect(target.v2WorkspaceLocalState.state.size).toBe(1);
		expect(target.v2SidebarSections.state.size).toBe(1);
	});
});
