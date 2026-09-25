/**
 * OpenCode's SQLite store (`<data>/opencode/opencode.db`, v1.x): assistant
 * messages are JSON in `message.data`, joined to `session` for the cwd and
 * title. Opened read-only — OpenCode may hold the database concurrently.
 * Kept apart from opencode.ts because better-sqlite3 is a Node-only native
 * binding the Bun unit suite cannot load.
 */
import Database from "better-sqlite3";
import {
	type OpencodeMessageRow,
	opencodeRowsToEntries,
} from "./opencode-rows";
import type { UsageLogEntry } from "./parse";

/** Returns the number of message rows read. */
export function collectOpencodeDbEntries(
	dbPath: string,
	cutoffMs: number,
	out: UsageLogEntry[],
	sessionLabels?: Map<string, string>,
): number {
	let db: InstanceType<typeof Database> | null = null;
	try {
		db = new Database(dbPath, { readonly: true, fileMustExist: true });
		const rows = db
			.prepare(
				`SELECT m.session_id, m.data, s.directory, s.title
				 FROM message m
				 LEFT JOIN session s ON s.id = m.session_id
				 WHERE m.time_created >= ?
				   AND json_extract(m.data, '$.role') = 'assistant'`,
			)
			.all(cutoffMs) as OpencodeMessageRow[];
		opencodeRowsToEntries(rows, cutoffMs, out, sessionLabels);
		return rows.length;
	} finally {
		db?.close();
	}
}
