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

test("account migration preserves existing bindings and survives database reopen", () => {
	const temp = mkdtempSync(join(tmpdir(), "account-binding-migration-"));
	const folder = join(temp, "migrations");
	const source = resolve(import.meta.dir, "../../drizzle");
	const journal = JSON.parse(
		readFileSync(join(source, "meta/_journal.json"), "utf8"),
	) as {
		entries: { tag: string }[];
	};
	const index = journal.entries.findIndex(
		(entry) => entry.tag === "0038_brown_owl",
	);
	expect(index).toBeGreaterThan(0);
	mkdirSync(join(folder, "meta"), { recursive: true });
	for (const entry of journal.entries.slice(0, index + 1)) {
		copyFileSync(
			join(source, `${entry.tag}.sql`),
			join(folder, `${entry.tag}.sql`),
		);
	}
	const writeJournal = (count: number) =>
		writeFileSync(
			join(folder, "meta/_journal.json"),
			JSON.stringify({ ...journal, entries: journal.entries.slice(0, count) }),
		);
	const dbPath = join(temp, "host.db");
	let sqlite = new Database(dbPath);
	try {
		writeJournal(index);
		runMigrations(drizzle(sqlite), folder);
		sqlite.exec(
			"INSERT INTO terminal_sessions (id, status, created_at) VALUES ('old-terminal', 'active', 1)",
		);
		sqlite.exec(
			"INSERT INTO terminal_agent_bindings (terminal_id, workspace_id, agent_id, agent_session_id, started_at, last_event_at, last_event_type, transcript_path) VALUES ('old-terminal', 'workspace', 'claude', 'native-session', 1, 2, 'Stop', '/fixture/transcript.jsonl')",
		);
		const original = sqlite
			.query<Record<string, unknown>, []>(
				"SELECT * FROM terminal_agent_bindings",
			)
			.get();
		writeJournal(index + 1);
		runMigrations(drizzle(sqlite), folder);
		expect(sqlite.query("SELECT * FROM terminal_agent_bindings").get()).toEqual(
			{ ...original, account_json: null, launch_id: null },
		);

		const account = JSON.stringify({
			agent: "claude",
			selection: "review-account",
			credentialKind: "subscription",
			identity: "fixture-identity",
			directory: "/fixture/profile",
		});
		sqlite
			.query(
				"UPDATE terminal_agent_bindings SET account_json = ?, launch_id = ? WHERE terminal_id = ?",
			)
			.run(account, "launch-1", "old-terminal");
		sqlite.close();
		sqlite = new Database(dbPath);
		runMigrations(drizzle(sqlite), folder);
		expect(sqlite.query("SELECT * FROM terminal_agent_bindings").get()).toEqual(
			{ ...original, account_json: account, launch_id: "launch-1" },
		);
	} finally {
		sqlite.close();
		rmSync(temp, { recursive: true, force: true });
	}
});
