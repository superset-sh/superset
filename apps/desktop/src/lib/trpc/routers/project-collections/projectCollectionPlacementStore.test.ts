import { Database } from "bun:sqlite";
import { afterEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { projectCollectionPlacements } from "@superset/local-db";
import { drizzle } from "drizzle-orm/bun-sqlite";
import type { LocalDb } from "main/lib/local-db";
import { projectCollectionPlacementStore } from "./projectCollectionPlacementStore";

const databases: Database[] = [];
afterEach(() => {
	for (const db of databases.splice(0)) db.close();
});
function setup() {
	const sqlite = new Database(":memory:");
	databases.push(sqlite);
	sqlite.run(
		readFileSync(
			resolve(
				import.meta.dir,
				"../../../../../../../packages/local-db/drizzle/0058_project_collection_placements.sql",
			),
			"utf8",
		),
	);
	sqlite.run(
		readFileSync(
			resolve(
				import.meta.dir,
				"../../../../../../../packages/local-db/drizzle/0059_project_collection_pending_deletes.sql",
			),
			"utf8",
		),
	);
	sqlite.run(
		readFileSync(
			resolve(
				import.meta.dir,
				"../../../../../../../packages/local-db/drizzle/0060_project_collection_pending_presentations.sql",
			),
			"utf8",
		),
	);
	sqlite.run(
		readFileSync(
			resolve(
				import.meta.dir,
				"../../../../../../../packages/local-db/drizzle/0061_project_collection_delete_dates.sql",
			),
			"utf8",
		),
	);
	const db = drizzle(sqlite, {
		schema: { projectCollectionPlacements },
	}) as unknown as LocalDb;
	return {
		sqlite,
		store: (organizationId = "org", userId = "alice") =>
			projectCollectionPlacementStore(db, { organizationId, userId }),
	};
}
const row = {
	key: "projects:team",
	kind: "collection" as const,
	tabOrder: 1,
	isCollapsed: true,
};

describe("SQLite project collection placements", () => {
	test("generated schema isolates organizations and users, upserts and deletes keys", () => {
		const h = setup();
		h.store().write([row], []);
		h.store("org", "bob").write([{ ...row, tabOrder: 3 }], []);
		h.store("other").write([{ ...row, tabOrder: 8 }], []);
		h.store().write([{ ...row, isCollapsed: false, tabOrder: 2 }], []);
		expect(h.store().list()).toEqual([
			{
				...row,
				tabOrder: 2,
				isCollapsed: false,
				organizationId: "org",
				userId: "alice",
			},
		]);
		h.store().write([], [row.key]);
		expect(h.store().list()).toEqual([]);
		expect(h.store("org", "bob").list()[0]?.tabOrder).toBe(3);
		expect(h.store("other").list()[0]?.tabOrder).toBe(8);
	});
	test("reconciliation prunes deleted projects and retired collections only in the current scope", () => {
		const h = setup();
		h.store().write(
			[
				row,
				{ key: "deleted", kind: "project", tabOrder: 0, isCollapsed: false },
			],
			[],
		);
		h.store("org", "bob").write([row], []);
		h.store().reconcile([row.key]);
		expect(
			h
				.store()
				.list()
				.map((item) => item.key),
		).toEqual([row.key]);
		h.store().reconcile([]);
		expect(h.store().list()).toEqual([]);
		expect(h.store("org", "bob").list()).toHaveLength(1);
	});
	test("a failed batch restores earlier updates and removals", () => {
		const h = setup();
		h.store().write([row], []);
		h.sqlite.run(
			"CREATE TRIGGER reject_bad BEFORE INSERT ON project_collection_placements WHEN NEW.key = 'bad' BEGIN SELECT RAISE(ABORT, 'bad key'); END",
		);
		expect(() =>
			h.store().write(
				[
					{ ...row, key: "new" },
					{ ...row, key: "bad" },
				],
				[row.key],
			),
		).toThrow("bad key");
		expect(
			h
				.store()
				.list()
				.map((item) => item.key),
		).toEqual([row.key]);
	});
});

test("placement store uses the public schema table identity", async () => {
	const { projectCollectionPlacements: publicTable } = await import(
		"@superset/local-db"
	);
	const h = setup();
	h.store().write([row], []);
	const db = drizzle(h.sqlite);
	expect(db.select().from(publicTable).all()[0]).toMatchObject(row);
});

test("placement writes retire old rail keys only for the current scope", () => {
	const h = setup();
	for (const userId of ["alice", "bob"])
		h.sqlite.run(
			"INSERT INTO project_collection_placements (organization_id, user_id, key, kind, tab_order, is_collapsed) VALUES ('org', ?, 'rail:a', 'project', 0, 0)",
			[userId],
		);
	h.store().write([{ ...row, key: "a", kind: "project" }], []);
	expect(
		h
			.store()
			.list()
			.map((row) => row.key),
	).toEqual(["a"]);
	expect(
		h
			.store("org", "bob")
			.list()
			.map((row) => row.key),
	).toEqual(["rail:a"]);
});

test("pending deletions persist with placements, isolate scopes and are acknowledged by host", () => {
	const h = setup();
	h.store().write(
		[],
		[],
		[
			{ machineId: "remote", tag: "team" },
			{ machineId: "other-host", tag: "team" },
		],
	);
	h.store("org", "bob").write([], [], [{ machineId: "remote", tag: "team" }]);
	h.store("other").write([], [], [{ machineId: "remote", tag: "team" }]);
	expect(h.store().pendingDeletes()).toHaveLength(2);
	h.store().acknowledgeDeletes([{ machineId: "remote", tag: "team" }]);
	expect(h.store().pendingDeletes()).toMatchObject([
		{ machineId: "other-host", tag: "team" },
	]);
	expect(h.store("org", "bob").pendingDeletes()).toHaveLength(1);
	expect(h.store("other").pendingDeletes()).toHaveLength(1);
	h.store().write([], [], [], ["team"]);
	expect(h.store().pendingDeletes()).toEqual([]);
});

test("the per-host deletion cap evicts the oldest deletion without blocking the batch", () => {
	const h = setup();
	const pending = Array.from({ length: 128 }, (_, i) => ({
		machineId: "remote",
		tag: `tag-${i}`,
	}));
	h.store().write([row], [], pending);
	const first = pending[0];
	if (!first) throw new Error("Missing first deletion");
	h.store().write([], [], [first]);
	h.store().write([], [row.key], [{ machineId: "remote", tag: "overflow" }]);
	expect(h.store().pendingDeletes()).toHaveLength(128);
	expect(h.store().list()).toHaveLength(0);
	expect(
		h
			.store()
			.pendingDeletes()
			.some((row) => row.tag === "tag-0"),
	).toBe(false);
	expect(
		h
			.store()
			.pendingDeletes()
			.some((row) => row.tag === "overflow"),
	).toBe(true);
	h.store().write([], [], [{ machineId: "another", tag: "team" }]);
	expect(h.store().pendingDeletes()).toHaveLength(129);
});

const presentation = {
	machineId: "remote",
	tag: "team",
	setting: {
		scope: "projects" as const,
		updatedAt: 200,
		createdAt: 100,
		create: true,
		tag: "team",
		displayName: "First",
		color: null,
		tabOrder: 0,
	},
};
test("pending presentations replace prior values and cancel deletions in mutation order", () => {
	const h = setup();
	h.store().write([], [], [presentation]);
	h.store().write([], [], [], [], [presentation]);
	expect(h.store().pendingDeletes()).toEqual([]);
	expect(h.store().pendingPresentations()).toMatchObject([presentation]);
	h.store("org", "bob").write([], [], [], [], [presentation]);
	const newer = {
		...presentation,
		setting: { ...presentation.setting, displayName: "Second" },
	};
	h.store().write([], [], [], [], [newer]);
	h.store().acknowledgePresentations([presentation]);
	expect(h.store().pendingPresentations()).toMatchObject([newer]);
	h.store().write([], [], [presentation]);
	expect(h.store().pendingPresentations()).toEqual([]);
	expect(h.store().pendingDeletes()).toHaveLength(1);
	expect(h.store("org", "bob").pendingPresentations()).toHaveLength(1);
	h.store().write([], [], [], [], [newer]);
	h.store().acknowledgePresentations([newer]);
	expect(h.store().pendingPresentations()).toEqual([]);
	expect(h.store().pendingDeletes()).toEqual([]);
});
test("pending presentations are capped at 128 per host and refreshed entries are retained", () => {
	const h = setup();
	const rows = Array.from({ length: 128 }, (_, index) => ({
		...presentation,
		tag: `tag-${index}`,
		setting: { ...presentation.setting, tag: `tag-${index}` },
	}));
	h.store().write([], [], [], [], rows);
	const first = rows[0];
	if (!first) throw new Error("Missing first entry");
	h.store().write(
		[],
		[],
		[],
		[],
		[{ ...first, setting: { ...first.setting, color: "red" } }],
	);
	h.store().write([], [], [], [], [presentation]);
	expect(h.store().pendingPresentations()).toHaveLength(128);
	expect(
		h
			.store()
			.pendingPresentations()
			.some((row) => row.tag === "tag-0"),
	).toBe(true);
	expect(
		h
			.store()
			.pendingPresentations()
			.some((row) => row.tag === "tag-1"),
	).toBe(false);
});

test("pending deletion dates survive persistence and replace an older deletion", () => {
	const h = setup();
	h.store().write(
		[],
		[],
		[{ machineId: "remote", tag: "team", deletedAt: 123 }],
	);
	expect(h.store().pendingDeletes()[0]?.deletedAt).toBe(123);
	h.store().write(
		[],
		[],
		[{ machineId: "remote", tag: "team", deletedAt: 456 }],
	);
	expect(h.store().pendingDeletes()[0]?.deletedAt).toBe(456);
	h.store().acknowledgeDeletes([
		{ machineId: "remote", tag: "team", deletedAt: 123 },
	]);
	expect(h.store().pendingDeletes()[0]?.deletedAt).toBe(456);
});
