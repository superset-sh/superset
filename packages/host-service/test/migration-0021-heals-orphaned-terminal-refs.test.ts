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
 * Long-lived host DBs carry terminal_sessions rows whose
 * origin_workspace_id points at workspaces deleted while FK enforcement was
 * not in effect on the deleting connection. The post-migration
 * foreign_key_check in createDb made those legacy orphans fatal, crash-looping
 * the host service on upgrade (canary 2026-08-10). Migration 0021 heals them
 * by applying the FK's own ON DELETE SET NULL action retroactively.
 *
 * createDb uses better-sqlite3, which Bun can't load, so this reproduces the
 * identical drizzle-migrator semantics on bun:sqlite (same approach as the
 * 0019 test).
 */
describe("migration 0021 upgrade", () => {
	const tempDirs: string[] = [];

	afterEach(() => {
		for (const dir of tempDirs.splice(0)) {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	function seedPre0021DbWithOrphan(): { dbPath: string } {
		const dir = mkdtempSync(join(tmpdir(), "host-migration-0021-"));
		tempDirs.push(dir);
		const dbPath = join(dir, "host.db");

		// A migrations folder truncated to 0020 — the pre-heal schema.
		const isPre0021 = (tag: string) => Number(tag.slice(0, 4)) < 21;
		const oldMigrations = join(dir, "drizzle-pre-0021");
		cpSync(MIGRATIONS_DIR, oldMigrations, { recursive: true });
		const journalPath = join(oldMigrations, "meta", "_journal.json");
		const journal = JSON.parse(readFileSync(journalPath, "utf8")) as {
			entries: Array<{ tag: string }>;
		};
		const removed = journal.entries.filter((entry) => !isPre0021(entry.tag));
		expect(removed.length).toBeGreaterThanOrEqual(1);
		journal.entries = journal.entries.filter((entry) => isPre0021(entry.tag));
		writeFileSync(journalPath, JSON.stringify(journal));
		for (const file of readdirSync(oldMigrations)) {
			if (/^\d{4}/.test(file) && !isPre0021(file)) {
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
			"insert into terminal_sessions (id, origin_workspace_id, created_at) values ('t-linked', 'w1', 0)",
		);
		// The legacy corruption: a session whose workspace is long gone.
		// Enforcement is off on this connection, mirroring how the orphans
		// were written in the wild.
		sqlite.exec("PRAGMA foreign_keys = OFF");
		sqlite.exec(
			"insert into terminal_sessions (id, origin_workspace_id, created_at) values ('t-orphan', 'w-deleted-long-ago', 0)",
		);
		sqlite.close();
		return { dbPath };
	}

	test("heals legacy orphans so the post-migration foreign_key_check passes", () => {
		const { dbPath } = seedPre0021DbWithOrphan();

		const sqlite = new BunDatabase(dbPath, { create: false, readwrite: true });
		sqlite.exec("PRAGMA foreign_keys = OFF");
		migrate(drizzle(sqlite, { schema }), { migrationsFolder: MIGRATIONS_DIR });
		const violations = sqlite
			.query("PRAGMA foreign_key_check")
			.all() as unknown[];
		sqlite.exec("PRAGMA foreign_keys = ON");

		expect(violations).toEqual([]);
		const orphan = sqlite
			.query(
				"select origin_workspace_id from terminal_sessions where id = 't-orphan'",
			)
			.get() as { origin_workspace_id: string | null } | null;
		const linked = sqlite
			.query(
				"select origin_workspace_id from terminal_sessions where id = 't-linked'",
			)
			.get() as { origin_workspace_id: string | null } | null;
		sqlite.close();

		// The orphan gets the FK's ON DELETE SET NULL action retroactively;
		// live links are untouched.
		expect(orphan?.origin_workspace_id).toBeNull();
		expect(linked?.origin_workspace_id).toBe("w1");
	});
});
