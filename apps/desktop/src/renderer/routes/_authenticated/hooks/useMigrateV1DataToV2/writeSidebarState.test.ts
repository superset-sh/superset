import { describe, expect, test } from "bun:test";
import type { OrgCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider/collections";
import {
	type SidebarInput,
	type V1ProjectLike,
	type V1SectionLike,
	type V1WorkspaceLike,
	writeV2SidebarState,
} from "./writeSidebarState";

interface InMemoryCollection<TValue, TKey extends string = string> {
	get: (key: TKey) => TValue | undefined;
	insert: (value: TValue) => void;
	_values: () => TValue[];
}

function createCollection<TValue extends Record<string, unknown>>(
	getKey: (v: TValue) => string,
): InMemoryCollection<TValue> {
	const store = new Map<string, TValue>();
	return {
		get: (key: string) => store.get(key),
		insert: (value: TValue) => {
			store.set(getKey(value), value);
		},
		_values: () => Array.from(store.values()),
	};
}

function makeCollections() {
	const v2SidebarProjects = createCollection<{
		projectId: string;
		tabOrder: number;
		defaultOpenInApp: string | null;
		isCollapsed: boolean;
		createdAt: Date;
	}>((v) => v.projectId);
	const v2SidebarSections = createCollection<{
		sectionId: string;
		projectId: string;
		name: string;
		tabOrder: number;
		isCollapsed: boolean;
		color: string | null;
		createdAt: Date;
	}>((v) => v.sectionId);
	const v2WorkspaceLocalState = createCollection<{
		workspaceId: string;
		sidebarState: {
			projectId: string;
			tabOrder: number;
			sectionId: string | null;
			changesFilter: { kind: string };
		};
		paneLayout: unknown;
		viewedFiles: string[];
		recentlyViewedFiles: unknown[];
		createdAt: Date;
	}>((v) => v.workspaceId);

	const collections = {
		v2SidebarProjects,
		v2SidebarSections,
		v2WorkspaceLocalState,
	} as unknown as OrgCollections;

	return {
		collections,
		v2SidebarProjects,
		v2SidebarSections,
		v2WorkspaceLocalState,
	};
}

function project(
	id: string,
	tabOrder: number | null = 0,
	defaultApp: string | null = null,
): V1ProjectLike {
	return { id, tabOrder, defaultApp };
}

function section(
	id: string,
	projectId: string,
	tabOrder: number,
	overrides: Partial<V1SectionLike> = {},
): V1SectionLike {
	return {
		id,
		projectId,
		tabOrder,
		name: `section-${id}`,
		isCollapsed: false,
		color: null,
		...overrides,
	};
}

function workspace(
	id: string,
	projectId: string,
	tabOrder: number,
	sectionId: string | null = null,
): V1WorkspaceLike {
	return { id, projectId, tabOrder, sectionId };
}

function buildInput(partial: Partial<SidebarInput>): SidebarInput {
	return {
		projectV1ToV2: partial.projectV1ToV2 ?? new Map(),
		workspaceV1ToV2: partial.workspaceV1ToV2 ?? new Map(),
		v1Projects: partial.v1Projects ?? [],
		v1Sections: partial.v1Sections ?? [],
		v1Workspaces: partial.v1Workspaces ?? [],
	};
}

describe("writeV2SidebarState", () => {
	test("empty input writes nothing", () => {
		const c = makeCollections();
		writeV2SidebarState(c.collections, buildInput({}));
		expect(c.v2SidebarProjects._values()).toHaveLength(0);
		expect(c.v2SidebarSections._values()).toHaveLength(0);
		expect(c.v2WorkspaceLocalState._values()).toHaveLength(0);
	});

	test("migrated projects get sidebar entries with tabOrder + defaultApp", () => {
		const c = makeCollections();
		writeV2SidebarState(
			c.collections,
			buildInput({
				projectV1ToV2: new Map([
					["v1-p1", "v2-p1"],
					["v1-p2", "v2-p2"],
				]),
				v1Projects: [project("v1-p1", 2, "cursor"), project("v1-p2", 5, null)],
			}),
		);
		const values = c.v2SidebarProjects._values();
		expect(values).toHaveLength(2);
		const p1 = values.find((v) => v.projectId === "v2-p1");
		expect(p1?.tabOrder).toBe(2);
		expect(p1?.defaultOpenInApp).toBe("cursor");
		const p2 = values.find((v) => v.projectId === "v2-p2");
		expect(p2?.tabOrder).toBe(5);
		expect(p2?.defaultOpenInApp).toBe(null);
	});

	test("null tabOrder on v1 project falls back to 0", () => {
		const c = makeCollections();
		writeV2SidebarState(
			c.collections,
			buildInput({
				projectV1ToV2: new Map([["v1", "v2"]]),
				v1Projects: [project("v1", null)],
			}),
		);
		expect(c.v2SidebarProjects._values()[0]?.tabOrder).toBe(0);
	});

	test("empty v1 section under a migrated project still migrates", () => {
		const c = makeCollections();
		writeV2SidebarState(
			c.collections,
			buildInput({
				projectV1ToV2: new Map([["v1-p", "v2-p"]]),
				v1Projects: [project("v1-p")],
				v1Sections: [
					section("sec-empty", "v1-p", 0, {
						name: "Empty Group",
						color: "#ff0000",
					}),
				],
			}),
		);
		const sections = c.v2SidebarSections._values();
		expect(sections).toHaveLength(1);
		expect(sections[0]?.name).toBe("Empty Group");
		expect(sections[0]?.projectId).toBe("v2-p");
		expect(sections[0]?.color).toBe("#ff0000");
	});

	test("sections under un-migrated projects are skipped", () => {
		const c = makeCollections();
		writeV2SidebarState(
			c.collections,
			buildInput({
				projectV1ToV2: new Map([["v1-p1", "v2-p1"]]),
				v1Projects: [project("v1-p1")],
				v1Sections: [
					section("sec-a", "v1-p1", 0),
					section("sec-b", "v1-untracked", 0),
				],
			}),
		);
		const sections = c.v2SidebarSections._values();
		expect(sections).toHaveLength(1);
		expect(sections[0]?.projectId).toBe("v2-p1");
	});

	test("workspace sectionId matches the v2 section id (deterministic from v1)", () => {
		const c = makeCollections();
		writeV2SidebarState(
			c.collections,
			buildInput({
				projectV1ToV2: new Map([["v1-p", "v2-p"]]),
				workspaceV1ToV2: new Map([["v1-w", "v2-w"]]),
				v1Projects: [project("v1-p")],
				v1Sections: [section("v1-sec", "v1-p", 0)],
				v1Workspaces: [workspace("v1-w", "v1-p", 0, "v1-sec")],
			}),
		);
		const ws = c.v2WorkspaceLocalState._values()[0];
		const sec = c.v2SidebarSections._values()[0];
		expect(ws?.sidebarState.sectionId).toBe(sec?.sectionId ?? "missing");
		// Reuses v1 id so reruns don't duplicate sections
		expect(sec?.sectionId).toBe("v1-sec");
	});

	test("rerun does not duplicate sections (idempotency)", () => {
		const c = makeCollections();
		const input = buildInput({
			projectV1ToV2: new Map([["v1-p", "v2-p"]]),
			v1Projects: [project("v1-p")],
			v1Sections: [section("s1", "v1-p", 0), section("s2", "v1-p", 1)],
		});
		writeV2SidebarState(c.collections, input);
		writeV2SidebarState(c.collections, input);
		writeV2SidebarState(c.collections, input);
		expect(c.v2SidebarSections._values()).toHaveLength(2);
	});

	test("workspace pointing to non-existent v1 section ends up at top level", () => {
		const c = makeCollections();
		writeV2SidebarState(
			c.collections,
			buildInput({
				projectV1ToV2: new Map([["v1-p", "v2-p"]]),
				workspaceV1ToV2: new Map([["v1-w", "v2-w"]]),
				v1Projects: [project("v1-p")],
				v1Sections: [],
				v1Workspaces: [workspace("v1-w", "v1-p", 0, "v1-sec-missing")],
			}),
		);
		const ws = c.v2WorkspaceLocalState._values()[0];
		expect(ws?.sidebarState.sectionId).toBe(null);
	});

	test("only adopted workspaces (in workspaceV1ToV2) get sidebar entries", () => {
		const c = makeCollections();
		writeV2SidebarState(
			c.collections,
			buildInput({
				projectV1ToV2: new Map([["v1-p", "v2-p"]]),
				workspaceV1ToV2: new Map([["v1-w1", "v2-w1"]]),
				v1Projects: [project("v1-p")],
				v1Workspaces: [
					workspace("v1-w1", "v1-p", 0),
					workspace("v1-w2", "v1-p", 1), // not adopted
				],
			}),
		);
		const values = c.v2WorkspaceLocalState._values();
		expect(values).toHaveLength(1);
		expect(values[0]?.workspaceId).toBe("v2-w1");
	});

	test("workspace under un-migrated project is skipped", () => {
		const c = makeCollections();
		writeV2SidebarState(
			c.collections,
			buildInput({
				projectV1ToV2: new Map([["v1-p-ok", "v2-p-ok"]]),
				workspaceV1ToV2: new Map([
					["v1-w-ok", "v2-w-ok"],
					["v1-w-orphan", "v2-w-orphan"],
				]),
				v1Projects: [project("v1-p-ok"), project("v1-p-missing")],
				v1Workspaces: [
					workspace("v1-w-ok", "v1-p-ok", 0),
					workspace("v1-w-orphan", "v1-p-missing", 0),
				],
			}),
		);
		const values = c.v2WorkspaceLocalState._values();
		expect(values).toHaveLength(1);
		expect(values[0]?.workspaceId).toBe("v2-w-ok");
	});

	test("tab orders apply the normalization rules", () => {
		// v1: [Section A (0), Workspace X (1), Section B (2), Workspace Y (3)]
		const c = makeCollections();
		writeV2SidebarState(
			c.collections,
			buildInput({
				projectV1ToV2: new Map([["p", "v2-p"]]),
				workspaceV1ToV2: new Map([
					["X", "v2-X"],
					["Y", "v2-Y"],
				]),
				v1Projects: [project("p")],
				v1Sections: [section("A", "p", 0), section("B", "p", 2)],
				v1Workspaces: [workspace("X", "p", 1), workspace("Y", "p", 3)],
			}),
		);
		const sections = c.v2SidebarSections._values();
		const workspaces = c.v2WorkspaceLocalState._values();
		// Top-level workspaces normalize to 0, 1; sections follow at 2, 3.
		const xState = workspaces.find((w) => w.workspaceId === "v2-X");
		const yState = workspaces.find((w) => w.workspaceId === "v2-Y");
		expect(xState?.sidebarState.tabOrder).toBe(0);
		expect(yState?.sidebarState.tabOrder).toBe(1);
		const aSec = sections.find((s) => s.name === "section-A");
		const bSec = sections.find((s) => s.name === "section-B");
		expect(aSec?.tabOrder).toBe(2);
		expect(bSec?.tabOrder).toBe(3);
	});

	test("idempotent: re-running with same input does not duplicate entries", () => {
		const c = makeCollections();
		const input = buildInput({
			projectV1ToV2: new Map([["v1-p", "v2-p"]]),
			workspaceV1ToV2: new Map([["v1-w", "v2-w"]]),
			v1Projects: [project("v1-p")],
			v1Sections: [section("sec", "v1-p", 0)],
			v1Workspaces: [workspace("v1-w", "v1-p", 0)],
		});
		writeV2SidebarState(c.collections, input);
		writeV2SidebarState(c.collections, input);
		expect(c.v2SidebarProjects._values()).toHaveLength(1);
		// Note: section UUID is generated fresh per call; idempotency for sections
		// relies on the outer migration calling writeV2SidebarState exactly once.
		// Workspace entries re-use the same workspaceV1ToV2 mapping so they dedup.
		expect(c.v2WorkspaceLocalState._values()).toHaveLength(1);
	});

	test("workspaces inside a section preserve within-section order", () => {
		const c = makeCollections();
		writeV2SidebarState(
			c.collections,
			buildInput({
				projectV1ToV2: new Map([["p", "v2-p"]]),
				workspaceV1ToV2: new Map([
					["w1", "v2-w1"],
					["w2", "v2-w2"],
					["w3", "v2-w3"],
				]),
				v1Projects: [project("p")],
				v1Sections: [section("sec", "p", 0)],
				v1Workspaces: [
					workspace("w1", "p", 7, "sec"),
					workspace("w2", "p", 1, "sec"),
					workspace("w3", "p", 4, "sec"),
				],
			}),
		);
		const workspaces = c.v2WorkspaceLocalState._values();
		const byId = new Map(workspaces.map((w) => [w.workspaceId, w]));
		// w2 (v1 tabOrder=1) should come first, then w3 (4), then w1 (7)
		expect(byId.get("v2-w2")?.sidebarState.tabOrder).toBe(0);
		expect(byId.get("v2-w3")?.sidebarState.tabOrder).toBe(1);
		expect(byId.get("v2-w1")?.sidebarState.tabOrder).toBe(2);
	});
});
