import { Database } from "bun:sqlite";
import { afterEach, describe, expect, test } from "bun:test";
import {
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { runMigrations } from "./runMigrations";

/**
 * The desktop runs migrations through better-sqlite3, which Bun cannot load.
 * bun:sqlite drives the identical drizzle migrator code path (both are sync
 * sessions on SQLiteSyncDialect), so these arms reproduce production
 * semantics exactly.
 */

type Entry = { tag: string; when: number; sql: string };

const REAL_JOURNAL = join(
	import.meta.dir,
	"../../../../../../../packages/local-db/drizzle/meta/_journal.json",
);

const CREATE_WORKTREES: Entry = {
	tag: "0000_create_worktrees",
	when: 1_000,
	sql: "CREATE TABLE `worktrees` (`id` text PRIMARY KEY NOT NULL, `path` text NOT NULL);",
};

/** Generated before the branch migration below, but merged after it. */
const ADD_CREATED_BY_SUPERSET: Entry = {
	tag: "0001_add_created_by_superset_to_worktrees",
	when: 2_000,
	sql: "ALTER TABLE `worktrees` ADD `created_by_superset` integer DEFAULT true NOT NULL;",
};

/** Generated after, but shipped first — a branch or canary build. */
const ADD_BRANCH_COLUMN: Entry = {
	tag: "0002_add_branch_column",
	when: 3_000,
	sql: "ALTER TABLE `worktrees` ADD `branch` text;",
};

describe("runMigrations", () => {
	const tempDirs: string[] = [];

	afterEach(() => {
		for (const dir of tempDirs.splice(0)) {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	function writeMigrations(entries: Entry[]): string {
		const dir = mkdtempSync(join(tmpdir(), "local-db-migrations-"));
		tempDirs.push(dir);
		mkdirSync(join(dir, "meta"));
		for (const entry of entries) {
			writeFileSync(join(dir, `${entry.tag}.sql`), entry.sql);
		}
		writeFileSync(
			join(dir, "meta/_journal.json"),
			JSON.stringify({
				version: "7",
				dialect: "sqlite",
				entries: entries.map((entry, idx) => ({
					idx,
					version: "6",
					when: entry.when,
					tag: entry.tag,
					breakpoints: true,
				})),
			}),
		);
		return dir;
	}

	function columns(sqlite: Database, table: string): string[] {
		return (
			sqlite.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]
		).map((row) => row.name);
	}

	function open(): Database {
		const sqlite = new Database(":memory:");
		sqlite.exec("PRAGMA foreign_keys = OFF");
		return sqlite;
	}

	test("drizzle's migrator drops a migration whose `when` is below the watermark", () => {
		const sqlite = open();
		// A build that shipped the later-generated migration first.
		migrate(drizzle(sqlite), {
			migrationsFolder: writeMigrations([CREATE_WORKTREES, ADD_BRANCH_COLUMN]),
		});
		// Upgrading to the build that carries both.
		migrate(drizzle(sqlite), {
			migrationsFolder: writeMigrations([
				CREATE_WORKTREES,
				ADD_CREATED_BY_SUPERSET,
				ADD_BRANCH_COLUMN,
			]),
		});

		// Silently skipped, with no error raised — the defect this runner replaces.
		expect(columns(sqlite, "worktrees")).not.toContain("created_by_superset");
	});

	test("applies a migration whose `when` is below the watermark", () => {
		const sqlite = open();
		runMigrations(
			drizzle(sqlite),
			writeMigrations([CREATE_WORKTREES, ADD_BRANCH_COLUMN]),
		);
		runMigrations(
			drizzle(sqlite),
			writeMigrations([
				CREATE_WORKTREES,
				ADD_CREATED_BY_SUPERSET,
				ADD_BRANCH_COLUMN,
			]),
		);

		expect(columns(sqlite, "worktrees")).toContain("created_by_superset");
	});

	test("heals a database drizzle's migrator already skipped a migration on", () => {
		const sqlite = open();
		migrate(drizzle(sqlite), {
			migrationsFolder: writeMigrations([CREATE_WORKTREES, ADD_BRANCH_COLUMN]),
		});
		const current = writeMigrations([
			CREATE_WORKTREES,
			ADD_CREATED_BY_SUPERSET,
			ADD_BRANCH_COLUMN,
		]);
		migrate(drizzle(sqlite), { migrationsFolder: current });
		expect(columns(sqlite, "worktrees")).not.toContain("created_by_superset");

		runMigrations(drizzle(sqlite), current);

		expect(columns(sqlite, "worktrees")).toContain("created_by_superset");
	});

	test("does not re-run a migration that was edited after it shipped", () => {
		const sqlite = open();
		const folder = writeMigrations([
			CREATE_WORKTREES,
			ADD_CREATED_BY_SUPERSET,
			ADD_BRANCH_COLUMN,
		]);
		runMigrations(drizzle(sqlite), folder);

		// 0004-0008 and 0011 were all edited after shipping, so their recorded
		// hashes no longer match the files. Re-running this one would raise
		// "duplicate column name".
		writeFileSync(
			join(folder, `${ADD_CREATED_BY_SUPERSET.tag}.sql`),
			`${ADD_CREATED_BY_SUPERSET.sql}\n-- edited after shipping\n`,
		);

		expect(() =>
			runMigrations(drizzle(sqlite), folder),
		).not.toThrow();
	});

	test("rolls the whole batch back when one migration fails", () => {
		const sqlite = open();
		const poison: Entry = {
			tag: "0003_poison",
			when: 4_000,
			sql: "ALTER TABLE `missing_table` ADD `x` integer;",
		};

		expect(() =>
			runMigrations(
				drizzle(sqlite),
				writeMigrations([
					CREATE_WORKTREES,
					ADD_CREATED_BY_SUPERSET,
					ADD_BRANCH_COLUMN,
					poison,
				]),
			),
		).toThrow();

		// Nothing landed, so the next launch retries the batch from the top
		// rather than running against a half-applied schema.
		const tables = (
			sqlite
				.prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
				.all() as { name: string }[]
		).map((row) => row.name);
		expect(tables).not.toContain("worktrees");
	});

	test("every shipped journal entry has a distinct `when`", () => {
		// The runner identifies applied migrations by `when`. Two entries sharing
		// one would let a real migration be mistaken for an applied one.
		const journal = JSON.parse(readFileSync(REAL_JOURNAL, "utf8")) as {
			entries: { when: number }[];
		};
		const whens = journal.entries.map((entry) => entry.when);

		expect(new Set(whens).size).toBe(whens.length);
	});
});
