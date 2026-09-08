import { Database as BunDatabase } from "bun:sqlite";
import { afterEach, describe, expect, test } from "bun:test";
import {
	cpSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
	unlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import * as schema from "../src/db/schema";

const MIGRATIONS_DIR = join(import.meta.dir, "..", "drizzle");

/**
 * Tags became personal in 0031: each row records who applied it and other
 * users no longer see it. Rows written before that have no creator, so the
 * rebuild attributes them to the workspace's creator — the one person who
 * could have filed it back then — and leaves the rest visible to everyone.
 *
 * createDb uses better-sqlite3, which Bun can't load, so this reproduces
 * the identical drizzle-migrator semantics on bun:sqlite (same approach as
 * the 0019 and 0021 tests).
 */
describe("migration 0031 upgrade", () => {
	const tempDirs: string[] = [];

	afterEach(() => {
		for (const dir of tempDirs.splice(0)) {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	function seedPre0031Db(): { dbPath: string } {
		const dir = mkdtempSync(join(tmpdir(), "host-migration-0031-"));
		tempDirs.push(dir);
		const dbPath = join(dir, "host.db");

		const isPre0031 = (tag: string) => Number(tag.slice(0, 4)) < 31;
		const oldMigrations = join(dir, "drizzle-pre-0031");
		cpSync(MIGRATIONS_DIR, oldMigrations, { recursive: true });
		const journalPath = join(oldMigrations, "meta", "_journal.json");
		const journal = JSON.parse(readFileSync(journalPath, "utf8")) as {
			entries: Array<{ tag: string }>;
		};
		const removed = journal.entries.filter((entry) => !isPre0031(entry.tag));
		expect(removed.length).toBeGreaterThanOrEqual(1);
		journal.entries = journal.entries.filter((entry) => isPre0031(entry.tag));
		writeFileSync(journalPath, JSON.stringify(journal));
		for (const file of readdirSync(oldMigrations)) {
			if (/^\d{4}/.test(file) && !isPre0031(file)) {
				unlinkSync(join(oldMigrations, file));
			}
		}

		const sqlite = new BunDatabase(dbPath, { create: true, readwrite: true });
		migrate(drizzle(sqlite, { schema }), { migrationsFolder: oldMigrations });
		sqlite.exec(
			"insert into projects (id, repo_path, created_at) values ('p1', '/tmp/repo', 0)",
		);
		sqlite.exec(
			"insert into workspaces (id, project_id, worktree_path, branch, created_by_user_id, created_at) values ('w-owned', 'p1', '/tmp/repo/a', 'a', 'user-a', 0)",
		);
		sqlite.exec(
			"insert into workspaces (id, project_id, worktree_path, branch, created_at) values ('w-unowned', 'p1', '/tmp/repo/b', 'b', 0)",
		);
		sqlite.exec(
			"insert into workspace_tags (workspace_id, tag, created_at) values ('w-owned', 'perf', 1), ('w-unowned', 'legacy', 2)",
		);
		sqlite.close();
		return { dbPath };
	}

	test("attributes existing tags to the workspace creator, or to no one", () => {
		const { dbPath } = seedPre0031Db();

		const sqlite = new BunDatabase(dbPath, { create: false, readwrite: true });
		sqlite.exec("PRAGMA foreign_keys = OFF");
		migrate(drizzle(sqlite, { schema }), { migrationsFolder: MIGRATIONS_DIR });
		const violations = sqlite
			.query("PRAGMA foreign_key_check")
			.all() as unknown[];
		sqlite.exec("PRAGMA foreign_keys = ON");

		const rows = sqlite
			.query(
				"select workspace_id, tag, created_by_user_id, created_at from workspace_tags order by workspace_id",
			)
			.all();
		sqlite.close();

		expect(violations).toEqual([]);
		expect(rows).toEqual([
			{
				workspace_id: "w-owned",
				tag: "perf",
				created_by_user_id: "user-a",
				created_at: 1,
			},
			{
				workspace_id: "w-unowned",
				tag: "legacy",
				created_by_user_id: "",
				created_at: 2,
			},
		]);
	});
});
