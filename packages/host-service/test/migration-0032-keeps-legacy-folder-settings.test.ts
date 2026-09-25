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
 * Folder presentation became per user in 0032. Nothing recorded who
 * customised a pre-existing row, so the rebuild keeps it as creator-less:
 * still visible to everyone, claimed by the next person who customises the
 * folder. Same bun:sqlite reproduction of the drizzle migrator as the other
 * migration tests.
 */
describe("migration 0032 upgrade", () => {
	const tempDirs: string[] = [];

	afterEach(() => {
		for (const dir of tempDirs.splice(0)) {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	test("keeps existing folder settings as creator-less rows", () => {
		const dir = mkdtempSync(join(tmpdir(), "host-migration-0032-"));
		tempDirs.push(dir);
		const dbPath = join(dir, "host.db");

		const isPre0032 = (tag: string) => Number(tag.slice(0, 4)) < 32;
		const oldMigrations = join(dir, "drizzle-pre-0032");
		cpSync(MIGRATIONS_DIR, oldMigrations, { recursive: true });
		const journalPath = join(oldMigrations, "meta", "_journal.json");
		const journal = JSON.parse(readFileSync(journalPath, "utf8")) as {
			entries: Array<{ tag: string }>;
		};
		expect(journal.entries.some((entry) => !isPre0032(entry.tag))).toBe(true);
		journal.entries = journal.entries.filter((entry) => isPre0032(entry.tag));
		writeFileSync(journalPath, JSON.stringify(journal));
		for (const file of readdirSync(oldMigrations)) {
			if (/^\d{4}/.test(file) && !isPre0032(file)) {
				unlinkSync(join(oldMigrations, file));
			}
		}

		let sqlite = new BunDatabase(dbPath, { create: true, readwrite: true });
		migrate(drizzle(sqlite, { schema }), { migrationsFolder: oldMigrations });
		sqlite.exec(
			"insert into tag_folder_settings (scope, tag, display_name, color, tab_order, updated_at) values ('sessions', 'perf', 'Performance', '#ff0000', 3, 7)",
		);
		sqlite.close();

		sqlite = new BunDatabase(dbPath, { create: false, readwrite: true });
		sqlite.exec("PRAGMA foreign_keys = OFF");
		migrate(drizzle(sqlite, { schema }), { migrationsFolder: MIGRATIONS_DIR });
		const violations = sqlite
			.query("PRAGMA foreign_key_check")
			.all() as unknown[];
		sqlite.exec("PRAGMA foreign_keys = ON");
		const rows = sqlite
			.query(
				"select scope, tag, created_by_user_id, display_name, color, tab_order, updated_at from tag_folder_settings",
			)
			.all();
		sqlite.close();

		expect(violations).toEqual([]);
		expect(rows).toEqual([
			{
				scope: "sessions",
				tag: "perf",
				created_by_user_id: "",
				display_name: "Performance",
				color: "#ff0000",
				tab_order: 3,
				updated_at: 7,
			},
		]);
	});
});
