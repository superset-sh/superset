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
 * Migration 0019 rebuilds `workspaces` (nullable project_id). Drizzle's
 * migrator runs every migration inside one transaction, where the generated
 * `PRAGMA foreign_keys=OFF` is a silent no-op — so with foreign keys enabled
 * on the connection, the rebuild's `DROP TABLE workspaces` fires ON DELETE
 * SET NULL into `terminal_sessions.origin_workspace_id` and severs every
 * terminal's workspace link on upgrade.
 *
 * `createDb` (src/db/db.ts) therefore disables foreign keys around
 * `migrate()`. That path uses better-sqlite3, which Bun can't load, so this
 * test reproduces the identical drizzle-migrator semantics on bun:sqlite:
 * one arm proves the FK-off discipline preserves links, the other proves
 * the corruption is real when foreign keys stay on (guarding against a
 * future revert of the db.ts fix looking harmless).
 */
describe("migration 0019 upgrade", () => {
	const tempDirs: string[] = [];

	afterEach(() => {
		for (const dir of tempDirs.splice(0)) {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	function seedPre0019Db(): { dbPath: string } {
		const dir = mkdtempSync(join(tmpdir(), "host-migration-0019-"));
		tempDirs.push(dir);
		const dbPath = join(dir, "host.db");

		// A migrations folder truncated to 0018 — the pre-upgrade schema.
		// Everything from 0019 onward is removed (later migrations would
		// otherwise be applied into the "pre-0019" fixture out of order).
		const isPre0019 = (tag: string) => Number(tag.slice(0, 4)) < 19;
		const oldMigrations = join(dir, "drizzle-pre-0019");
		cpSync(MIGRATIONS_DIR, oldMigrations, { recursive: true });
		const journalPath = join(oldMigrations, "meta", "_journal.json");
		const journal = JSON.parse(readFileSync(journalPath, "utf8")) as {
			entries: Array<{ tag: string }>;
		};
		const removed = journal.entries.filter((entry) => !isPre0019(entry.tag));
		expect(removed.length).toBeGreaterThanOrEqual(1);
		journal.entries = journal.entries.filter((entry) => isPre0019(entry.tag));
		writeFileSync(journalPath, JSON.stringify(journal));
		for (const file of readdirSync(oldMigrations)) {
			if (/^\d{4}/.test(file) && !isPre0019(file)) {
				unlinkSync(join(oldMigrations, file));
			}
		}

		const sqlite = new BunDatabase(dbPath, { create: true, readwrite: true });
		migrate(drizzle(sqlite, { schema }), { migrationsFolder: oldMigrations });
		sqlite.exec(
			"insert into projects (id, repo_path, created_at) values ('p1', '/tmp/repo', 0)",
		);
		sqlite.exec(
			"insert into workspaces (id, project_id, worktree_path, branch, created_at) values ('w1', 'p1', '/tmp/repo/wt', 'main', 0)",
		);
		sqlite.exec(
			"insert into terminal_sessions (id, origin_workspace_id, created_at) values ('t1', 'w1', 0)",
		);
		sqlite.close();
		return { dbPath };
	}

	function readLinks(dbPath: string) {
		const check = new BunDatabase(dbPath, { readonly: true });
		const workspace = check
			.query("select project_id from workspaces where id = 'w1'")
			.get() as { project_id: string | null } | null;
		const terminal = check
			.query(
				"select origin_workspace_id from terminal_sessions where id = 't1'",
			)
			.get() as { origin_workspace_id: string | null } | null;
		check.close();
		return { workspace, terminal };
	}

	test("foreign keys OFF around migrate (the db.ts discipline) preserves terminal links", () => {
		const { dbPath } = seedPre0019Db();

		const sqlite = new BunDatabase(dbPath, { create: false, readwrite: true });
		sqlite.exec("PRAGMA foreign_keys = OFF");
		migrate(drizzle(sqlite, { schema }), { migrationsFolder: MIGRATIONS_DIR });
		const violations = sqlite
			.query("PRAGMA foreign_key_check")
			.all() as unknown[];
		sqlite.exec("PRAGMA foreign_keys = ON");
		sqlite.close();

		expect(violations).toEqual([]);
		const { workspace, terminal } = readLinks(dbPath);
		expect(workspace?.project_id).toBe("p1");
		expect(terminal?.origin_workspace_id).toBe("w1");
	});

	test("foreign keys ON during migrate severs terminal links — the failure the discipline prevents", () => {
		const { dbPath } = seedPre0019Db();

		const sqlite = new BunDatabase(dbPath, { create: false, readwrite: true });
		sqlite.exec("PRAGMA foreign_keys = ON");
		migrate(drizzle(sqlite, { schema }), { migrationsFolder: MIGRATIONS_DIR });
		sqlite.close();

		const { terminal } = readLinks(dbPath);
		expect(terminal?.origin_workspace_id).toBeNull();
	});
});
