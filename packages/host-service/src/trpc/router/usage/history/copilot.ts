/**
 * Copilot CLI usage. `~/.copilot/session-store.db` (SQLite) has an
 * `assistant_usage_events` table with per-request token counts joined to a
 * `sessions` table carrying the cwd and a summary. Opened read-only — the
 * CLI may hold the database concurrently.
 */

import { homedir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import type { UsageLogEntry } from "./parse";
import { num } from "./parse";

export function copilotDbPath(): string {
	return join(homedir(), ".copilot", "session-store.db");
}

export interface CopilotUsageRow {
	session_id: string | null;
	model: string | null;
	input_tokens: number | null;
	output_tokens: number | null;
	cache_read_tokens: number | null;
	cache_write_tokens: number | null;
	reasoning_tokens: number | null;
	created_at: string | null;
	cwd: string | null;
	summary: string | null;
}

/** `created_at` is SQLite's `datetime('now')` — UTC without a zone marker. */
function parseUtcTimestamp(raw: string | null): number {
	if (!raw) return 0;
	const parsed = Date.parse(`${raw.replace(" ", "T")}Z`);
	return Number.isFinite(parsed) ? parsed : 0;
}

/** Pure row → entry mapping, exported for tests (bun can't load sqlite). */
export function copilotRowsToEntries(
	rows: CopilotUsageRow[],
	cutoffMs: number,
	out: UsageLogEntry[],
	sessionLabels?: Map<string, string>,
): void {
	for (const row of rows) {
		const timestampMs = parseUtcTimestamp(row.created_at);
		if (!timestampMs || timestampMs < cutoffMs) continue;
		const sessionId = row.session_id ?? "unknown";
		if (row.summary && sessionLabels && !sessionLabels.has(sessionId)) {
			sessionLabels.set(sessionId, row.summary);
		}
		out.push({
			agent: "copilot",
			model: row.model || "unknown",
			timestampMs,
			cwd: row.cwd ?? null,
			sessionId,
			// Cache reads/writes are separate columns (Anthropic-style), so
			// input_tokens is taken as the non-cached count.
			uncachedInput: num(row.input_tokens),
			cachedInput: num(row.cache_read_tokens),
			cacheWrite5m: num(row.cache_write_tokens),
			cacheWrite1h: 0,
			output: num(row.output_tokens),
			reasoningOutput: num(row.reasoning_tokens),
		});
	}
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
