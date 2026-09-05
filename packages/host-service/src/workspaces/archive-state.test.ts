import { Database } from "bun:sqlite";
import { describe, expect, it } from "bun:test";
import { resolve } from "node:path";
import type { SQL } from "drizzle-orm";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import * as schema from "../db/schema";
import {
	isTombstoned,
	isUserArchived,
	notTombstoned,
	tombstoned,
	userArchived,
} from "./archive-state";

const MIGRATIONS_FOLDER = resolve(import.meta.dir, "../../drizzle");

function seededDb() {
	const sqlite = new Database(":memory:");
	const db = drizzle(sqlite, { schema });
	migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
	const base = {
		projectId: null,
		branch: "b",
		name: "b",
		type: "session" as const,
	};
	db.insert(schema.workspaces)
		.values([
			{ ...base, id: "live", worktreePath: "/wt/live" },
			{
				...base,
				id: "user",
				worktreePath: "/wt/user",
				archivedAt: 1,
				archiveReason: "user",
			},
			{
				...base,
				id: "deleted",
				worktreePath: "/wt/deleted",
				archivedAt: 2,
				archiveReason: "deleted",
			},
			{
				...base,
				id: "merged",
				worktreePath: "/wt/merged",
				archivedAt: 3,
				archiveReason: "merged",
			},
			// A stamp with no reason predates nothing (0020 added both columns
			// together) but must still read as destroyed, never as put away.
			{
				...base,
				id: "bare",
				worktreePath: "/wt/bare",
				archivedAt: 4,
				archiveReason: null,
			},
		])
		.run();
	return db;
}

function ids(db: ReturnType<typeof seededDb>, where: SQL | undefined) {
	return db
		.select({ id: schema.workspaces.id })
		.from(schema.workspaces)
		.where(where)
		.all()
		.map((row) => row.id)
		.sort();
}

describe("archive state predicates", () => {
	it("tells a tombstone from a user archive from a live row", () => {
		expect(isTombstoned({ archivedAt: null, archiveReason: null })).toBe(false);
		expect(isUserArchived({ archivedAt: null, archiveReason: null })).toBe(
			false,
		);
		expect(isTombstoned({ archivedAt: 1, archiveReason: "user" })).toBe(false);
		expect(isUserArchived({ archivedAt: 1, archiveReason: "user" })).toBe(true);
		expect(isTombstoned({ archivedAt: 1, archiveReason: "deleted" })).toBe(
			true,
		);
		expect(isTombstoned({ archivedAt: 1, archiveReason: "merged" })).toBe(true);
		expect(isTombstoned({ archivedAt: 1, archiveReason: null })).toBe(true);
		expect(isUserArchived({ archivedAt: 1, archiveReason: null })).toBe(false);
	});

	it("the SQL twins agree with the predicates", () => {
		const db = seededDb();
		expect(ids(db, notTombstoned)).toEqual(["live", "user"]);
		expect(ids(db, userArchived)).toEqual(["user"]);
		expect(ids(db, tombstoned)).toEqual(["bare", "deleted", "merged"]);
	});
});
