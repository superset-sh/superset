/**
 * Copilot CLI usage. `~/.copilot/session-store.db` (SQLite) has an
 * `assistant_usage_events` table with per-request token counts joined to a
 * `sessions` table carrying the cwd and a summary. Opened read-only — the
 * CLI may hold the database concurrently.
 */

import { homedir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { type CopilotUsageRow, copilotRowsToEntries } from "./copilot-rows";
import type { UsageLogEntry } from "./parse";

export { type CopilotUsageRow, copilotRowsToEntries } from "./copilot-rows";

export function copilotDbPath(): string {
	return join(homedir(), ".copilot", "session-store.db");
}

/** Returns 1 when the database was scanned, 0 when absent/unreadable. */
export function collectCopilotEntries(
	cutoffMs: number,
	out: UsageLogEntry[],
	sessionLabels?: Map<string, string>,
	dbPath: string = copilotDbPath(),
): number {
	let db: InstanceType<typeof Database> | null = null;
	try {
		db = new Database(dbPath, { readonly: true, fileMustExist: true });
		const rows = db
			.prepare(
				`SELECT e.session_id, e.model, e.input_tokens, e.output_tokens,
				        e.cache_read_tokens, e.cache_write_tokens, e.reasoning_tokens,
				        e.created_at, s.cwd, s.summary
				 FROM assistant_usage_events e
				 LEFT JOIN sessions s ON s.id = e.session_id
				 WHERE e.created_at >= datetime(? / 1000, 'unixepoch')`,
			)
			.all(cutoffMs) as CopilotUsageRow[];
		copilotRowsToEntries(rows, cutoffMs, out, sessionLabels);
		return 1;
	} catch {
		return 0;
	} finally {
		db?.close();
	}
}
