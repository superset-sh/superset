/**
 * Devin CLI usage. `<data>/devin/cli/sessions.db` (SQLite, WAL) holds every
 * local session: `sessions` carries the cwd, model and title, `message_nodes`
 * the conversation as JSON whose assistant messages embed per-request
 * `metrics` (input/output/cache-read tokens). Opened read-only — the CLI may
 * hold the database concurrently. Kept apart from the Bun unit suite because
 * better-sqlite3 is a Node-only native binding.
 */
import { homedir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { type DevinMessageRow, devinRowsToEntries } from "./devin-rows";
import type { UsageLogEntry } from "./parse";

export function devinDbPath(): string {
	const dataHome =
		process.env.XDG_DATA_HOME?.trim() || join(homedir(), ".local", "share");
	return join(dataHome, "devin", "cli", "sessions.db");
}

/** Returns 1 when the database was scanned, 0 when absent/unreadable. */
export function collectDevinEntries(
	cutoffMs: number,
	out: UsageLogEntry[],
	sessionLabels?: Map<string, string>,
	dbPath: string = devinDbPath(),
): number {
	let db: InstanceType<typeof Database> | null = null;
	try {
		db = new Database(dbPath, { readonly: true, fileMustExist: true });
		const rows = db
			.prepare(
				`SELECT m.session_id, m.chat_message, m.created_at,
				        s.working_directory, s.model, s.title
				 FROM message_nodes m
				 LEFT JOIN sessions s ON s.id = m.session_id
				 WHERE m.created_at >= ?
				   AND json_extract(m.chat_message, '$.role') = 'assistant'`,
			)
			.all(Math.floor(cutoffMs / 1000)) as DevinMessageRow[];
		devinRowsToEntries(rows, cutoffMs, out, sessionLabels);
		return 1;
	} catch {
		return 0;
	} finally {
		db?.close();
	}
}
