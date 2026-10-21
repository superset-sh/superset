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
import { runMigrations } from "@superset/shared/sqlite-migrations";
import { drizzle } from "drizzle-orm/bun-sqlite";

test("saved-history migration preserves recovery data through terminal and workspace deletion and DB reopen", () => {
	const directory = mkdtempSync(join(tmpdir(), "saved-history-migration-"));
	const folder = join(directory, "migrations");
	const source = resolve(import.meta.dir, "../../drizzle");
	const journal = JSON.parse(
		readFileSync(join(source, "meta/_journal.json"), "utf8"),
	) as { entries: Array<{ tag: string }> };
	const index = journal.entries.findIndex(
		(entry) => entry.tag === "0039_saved_native_conversations",
	);
	expect(index).toBeGreaterThan(0);
	mkdirSync(join(folder, "meta"), { recursive: true });
	for (const entry of journal.entries.slice(0, index + 1))
		copyFileSync(
			join(source, `${entry.tag}.sql`),
			join(folder, `${entry.tag}.sql`),
		);
	const setFixtureJournal = (count: number) =>
		writeFileSync(
			join(folder, "meta/_journal.json"),
			JSON.stringify({ ...journal, entries: journal.entries.slice(0, count) }),
		);
	const dbPath = join(directory, "host.db");
	let sqlite = new Database(dbPath);
	try {
		setFixtureJournal(index);
		runMigrations(drizzle(sqlite), folder);
		sqlite.exec("PRAGMA foreign_keys=ON");
		sqlite.exec(
			"INSERT INTO workspaces (id, worktree_path, branch, created_at) VALUES ('workspace', '/fixture/workspace', 'main', 1)",
		);
		sqlite.exec(
			"INSERT INTO terminal_sessions (id, origin_workspace_id, status, created_at) VALUES ('old-terminal', 'workspace', 'active', 1)",
		);
		sqlite.exec(
			"INSERT INTO terminal_agent_bindings (terminal_id, workspace_id, agent_id, agent_session_id, started_at, last_event_at, last_event_type) VALUES ('old-terminal', 'workspace', 'claude', 'native-session', 1, 2, 'Stop')",
		);
		const original = sqlite
			.query("SELECT * FROM terminal_agent_bindings")
			.get();
		setFixtureJournal(index + 1);
		runMigrations(drizzle(sqlite), folder);
		expect(sqlite.query("SELECT * FROM terminal_agent_bindings").get()).toEqual(
			original,
		);
		const saved = {
			id: "saved",
			workspace_id: "workspace",
			provider: "claude",
			native_session_id: "native-session",
			store_path: "/fixture/store",
			transcript_path: "/fixture/store/project/history.jsonl",
			cwd: "/fixture/workspace",
			definition_id: "claude-custom",
			account_json: JSON.stringify({
				selection: "/fixture/account",
				identity: "selected-account",
			}),
			provenance_json: JSON.stringify({
				source: "native-claude",
				sha256: "original-history-digest",
				checkpointPath: "/fixture/checkpoints/saved.jsonl",
			}),
			adopted_at: 123,
			state: "bound",
			terminal_id: "old-terminal",
		};
		sqlite
			.query(
				"INSERT INTO saved_conversations (id, workspace_id, provider, native_session_id, store_path, transcript_path, cwd, definition_id, account_json, provenance_json, adopted_at, state, terminal_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
			)
			.run(...Object.values(saved));
		sqlite.exec("DELETE FROM terminal_sessions WHERE id='old-terminal'");
		expect(
			sqlite.query("SELECT * FROM terminal_agent_bindings").get(),
		).toBeNull();
		expect(sqlite.query("SELECT * FROM saved_conversations").get()).toEqual(
			saved,
		);
		sqlite.exec("DELETE FROM workspaces WHERE id='workspace'");
		expect(sqlite.query("SELECT * FROM workspaces").get()).toBeNull();
		expect(sqlite.query("SELECT * FROM saved_conversations").get()).toEqual(
			saved,
		);
		sqlite.close();
		sqlite = new Database(dbPath);
		sqlite.exec("PRAGMA foreign_keys=ON");
		runMigrations(drizzle(sqlite), folder);
		expect(sqlite.query("SELECT * FROM saved_conversations").get()).toEqual(
			saved,
		);
	} finally {
		sqlite.close();
		rmSync(directory, { recursive: true, force: true });
	}
});

test("saved-history ownership is unique across workspaces but allows different stores", () => {
	const sqlite = new Database(":memory:");
	try {
		runMigrations(drizzle(sqlite), resolve(import.meta.dir, "../../drizzle"));
		sqlite.exec("PRAGMA foreign_keys=ON");
		sqlite.exec(
			"INSERT INTO workspaces (id, worktree_path, branch, created_at) VALUES ('first-workspace', '/fixture/first', 'main', 1), ('second-workspace', '/fixture/second', 'main', 2)",
		);
		const insert = sqlite.query(
			"INSERT INTO saved_conversations (id, workspace_id, provider, native_session_id, store_path, transcript_path, cwd, definition_id, account_json, provenance_json, adopted_at) VALUES (?, ?, 'claude', 'native-session', ?, '/fixture/history.jsonl', '/fixture/workspace', 'claude', '{}', '{}', 1)",
		);
		insert.run("first", "first-workspace", "/fixture/store");
		expect(() =>
			insert.run("duplicate", "second-workspace", "/fixture/store"),
		).toThrow("UNIQUE constraint failed");
		insert.run("other-store", "second-workspace", "/fixture/other-store");
		expect(
			sqlite.query("SELECT id FROM saved_conversations ORDER BY id").all(),
		).toEqual([{ id: "first" }, { id: "other-store" }]);
	} finally {
		sqlite.close();
	}
});
