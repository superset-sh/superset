/**
 * OpenCode's SQLite store (`<data>/opencode/opencode.db`), opened read-only —
 * OpenCode may hold the database concurrently. Kept apart from opencode.ts
 * because better-sqlite3 is a Node-only native binding the Bun unit suite
 * cannot load; the queries live in opencode-rows.ts.
 */
import Database from "better-sqlite3";
import {
	opencodeRowsToEntries,
	readOpencodeMessageRows,
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
		const rows = readOpencodeMessageRows(db, cutoffMs);
		opencodeRowsToEntries(rows, cutoffMs, out, sessionLabels);
		return rows.length;
	} finally {
		db?.close();
	}
}
