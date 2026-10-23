import { Database } from "bun:sqlite";
import { expect, test } from "bun:test";
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
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";

test("chat account migration preserves legacy data and durably enforces unique launch and successor receipts", () => {
	const dir = mkdtempSync(join(tmpdir(), "chat-account-migration-"));
	const source = resolve(import.meta.dir, "drizzle");
	const folder = join(dir, "migrations");
	mkdirSync(join(folder, "meta"), { recursive: true });
	const journal = JSON.parse(
		readFileSync(join(source, "meta/_journal.json"), "utf8"),
	) as { entries: Array<{ tag: string }> };
	const index = journal.entries.findIndex(
		(entry) => entry.tag === "0001_account_chat_launch_context",
	);
	expect(index).toBe(1);
	for (const entry of journal.entries)
		copyFileSync(
			join(source, `${entry.tag}.sql`),
			join(folder, `${entry.tag}.sql`),
		);
	const writeJournal = (count: number) =>
		writeFileSync(
			join(folder, "meta/_journal.json"),
			JSON.stringify({ ...journal, entries: journal.entries.slice(0, count) }),
		);
	let sqlite = new Database(join(dir, "chat.db"));
	try {
		writeJournal(index);
		migrate(drizzle(sqlite), { migrationsFolder: folder });
		sqlite.exec(
			"INSERT INTO chat_sessions_local (session_id, scope_id, harness, harness_session_id, epoch, status, title, updated_at) VALUES ('old', 'workspace', 'claude-acp', 'native-old', 'epoch', 'idle', 'kept', 1)",
		);
		const original = sqlite
			.query("SELECT * FROM chat_sessions_local")
			.get() as Record<string, unknown>;
		writeJournal(index + 1);
		migrate(drizzle(sqlite), { migrationsFolder: folder });
		expect(sqlite.query("SELECT * FROM chat_sessions_local").get()).toEqual({
			...original,
			launch_context: null,
			create_command_id: null,
			predecessor_session_id: null,
		});
		sqlite.exec(
			"UPDATE chat_sessions_local SET launch_context='fixture', create_command_id='command', predecessor_session_id='source' WHERE session_id='old'",
		);
		sqlite.close();
		sqlite = new Database(join(dir, "chat.db"));
		migrate(drizzle(sqlite), { migrationsFolder: folder });
		expect(
			sqlite
				.query(
					"SELECT launch_context, create_command_id, predecessor_session_id FROM chat_sessions_local",
				)
				.get(),
		).toEqual({
			launch_context: "fixture",
			create_command_id: "command",
			predecessor_session_id: "source",
		});
		for (const field of ["create_command_id", "predecessor_session_id"]) {
			expect(() =>
				sqlite.exec(
					`INSERT INTO chat_sessions_local (session_id, scope_id, harness, epoch, status, updated_at, ${field}) SELECT 'duplicate', 'workspace', 'claude-acp', 'epoch', 'idle', 1, ${field} FROM chat_sessions_local WHERE session_id='old'`,
				),
			).toThrow(`UNIQUE constraint failed: chat_sessions_local.${field}`);
		}
		const insertLegacy = sqlite.query(
			"INSERT INTO chat_sessions_local (session_id, scope_id, harness, epoch, status, updated_at) VALUES (?, 'workspace', 'claude-acp', 'epoch', 'idle', 1)",
		);
		insertLegacy.run("null-a");
		insertLegacy.run("null-b");
		expect(
			sqlite
				.query(
					"SELECT session_id, create_command_id, predecessor_session_id FROM chat_sessions_local WHERE session_id IN ('null-a', 'null-b') ORDER BY session_id",
				)
				.all(),
		).toEqual([
			{
				session_id: "null-a",
				create_command_id: null,
				predecessor_session_id: null,
			},
			{
				session_id: "null-b",
				create_command_id: null,
				predecessor_session_id: null,
			},
		]);
	} finally {
		sqlite.close();
		rmSync(dir, { recursive: true, force: true });
	}
});
