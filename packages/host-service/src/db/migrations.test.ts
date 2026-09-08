import { Database } from "bun:sqlite";
import { afterEach, describe, expect, test } from "bun:test";
import {
	copyFileSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { runMigrations } from "@superset/shared/sqlite-migrations";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";

/**
 * createDb runs on better-sqlite3, which Bun cannot load. bun:sqlite drives
 * the identical code path (both are sync sessions on SQLiteSyncDialect), so
 * these arms reproduce what a real host.db does.
 */

const MIGRATIONS_FOLDER = resolve(import.meta.dir, "../../drizzle");

/**
 * The two migrations HOST-SERVICE-53/54 came in without. A build carrying
 * 0028 but neither of these — a branch cut before they merged — leaves the
 * watermark above both, and drizzle's migrator never runs them again.
 */
const LOST = ["0026_workspace_tags", "0027_workspace_tag_settings"];
const LAST_SHIPPED_WITH_THEM_LOST = "0028_funny_gideon";

type Journal = {
	entries: { idx: number; version: string; when: number; tag: string }[];
};

function readJournal(folder: string): Journal {
	return JSON.parse(
		readFileSync(join(folder, "meta/_journal.json"), "utf8"),
	) as Journal;
}

const tempDirs: string[] = [];

/** The real migration folder, minus `omit`, truncated after `through`. */
function folderWithout(options: { omit: string[]; through: string }): string {
	const journal = readJournal(MIGRATIONS_FOLDER);
	const end = journal.entries.findIndex(
		(entry) => entry.tag === options.through,
	);
	expect(end).toBeGreaterThan(-1);
	const entries = journal.entries
		.slice(0, end + 1)
		.filter((entry) => !options.omit.includes(entry.tag));

	const dir = mkdtempSync(join(tmpdir(), "host-migrations-"));
	tempDirs.push(dir);
	mkdirSync(join(dir, "meta"));
	for (const entry of entries) {
		copyFileSync(
			join(MIGRATIONS_FOLDER, `${entry.tag}.sql`),
			join(dir, `${entry.tag}.sql`),
		);
	}
	writeFileSync(
		join(dir, "meta/_journal.json"),
		JSON.stringify({ version: "7", dialect: "sqlite", entries }),
	);
	return dir;
}

function open(): Database {
	const sqlite = new Database(":memory:");
	// What createDb does while migrating, for the same reason.
	sqlite.exec("PRAGMA foreign_keys = OFF");
	return sqlite;
}

function tables(sqlite: Database): string[] {
	return (
		sqlite
			.prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
			.all() as { name: string }[]
	).map((row) => row.name);
}

describe("host.db migrations", () => {
	afterEach(() => {
		for (const dir of tempDirs.splice(0)) {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	test("drizzle's migrator cannot recover a database that lost them", () => {
		const sqlite = open();
		migrate(drizzle(sqlite), {
			migrationsFolder: folderWithout({
				omit: LOST,
				through: LAST_SHIPPED_WITH_THEM_LOST,
			}),
		});
		expect(tables(sqlite)).not.toContain("workspace_tags");

		// Every later release carries both, and both stay below the watermark.
		// 0029 reads workspace_tag_settings to fold it into tag_folder_settings,
		// so from that release on the host-service cannot even start: createDb
		// lets a failed migration throw rather than serve a half-migrated DB.
		expect(() =>
			migrate(drizzle(sqlite), { migrationsFolder: MIGRATIONS_FOLDER }),
		).toThrow("workspace_tag_settings");
	});

	test("the runner heals a database that lost them", () => {
		const sqlite = open();
		migrate(drizzle(sqlite), {
			migrationsFolder: folderWithout({
				omit: LOST,
				through: LAST_SHIPPED_WITH_THEM_LOST,
			}),
		});

		runMigrations(drizzle(sqlite), MIGRATIONS_FOLDER);

		// workspace.list and project.list read these two.
		expect(tables(sqlite)).toContain("workspace_tags");
		expect(tables(sqlite)).toContain("tag_folder_settings");
		expect(() =>
			sqlite.prepare("SELECT * FROM workspace_tags").all(),
		).not.toThrow();
	});

	test("the runner applies the whole set to a fresh database", () => {
		const sqlite = open();

		runMigrations(drizzle(sqlite), MIGRATIONS_FOLDER);

		expect(tables(sqlite)).toContain("workspaces");
		expect(tables(sqlite)).toContain("workspace_tags");
		expect(tables(sqlite)).toContain("tag_folder_settings");
	});

	test("every shipped journal entry has a distinct `when`", () => {
		// The runner identifies applied migrations by `when`. Two entries sharing
		// one would let a real migration be mistaken for an applied one.
		const whens = readJournal(MIGRATIONS_FOLDER).entries.map(
			(entry) => entry.when,
		);

		expect(new Set(whens).size).toBe(whens.length);
	});
});
