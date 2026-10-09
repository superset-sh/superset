/**
 * Hermes Agent usage. `<HERMES_HOME>/state.db` (SQLite, WAL) holds one
 * `sessions` row per session with its token totals, and
 * `session_model_usage` splits those totals per model. Each profile
 * (`<root>/profiles/<name>`) is its own HERMES_HOME with its own database.
 * Opened read-only — Hermes may hold the database concurrently. Kept apart
 * from the Bun unit suite because better-sqlite3 is a Node-only native binding.
 */
import { readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import {
	type HermesModelUsageRow,
	type HermesSessionRow,
	hermesRowsToEntries,
} from "./hermes-rows";
import type { UsageLogEntry } from "./parse";

export function hermesHomes(): string[] {
	const root =
		process.platform === "win32"
			? join(
					process.env.LOCALAPPDATA?.trim() ||
						join(homedir(), "AppData", "Local"),
					"hermes",
				)
			: join(homedir(), ".hermes");
	const homes = new Set<string>([root]);
	try {
		for (const profile of readdirSync(join(root, "profiles"), {
			withFileTypes: true,
		})) {
			if (profile.isDirectory())
				homes.add(join(root, "profiles", profile.name));
		}
	} catch {}
	const fromEnv = process.env.HERMES_HOME?.trim();
	if (fromEnv) homes.add(fromEnv);
	return [...homes];
}

/** Returns 1 when the database was scanned, 0 when absent/unreadable. */
export function collectHermesEntries(
	hermesHome: string,
	cutoffMs: number,
	out: UsageLogEntry[],
	sessionLabels?: Map<string, string>,
): number {
	let db: InstanceType<typeof Database> | null = null;
	try {
		db = new Database(join(hermesHome, "state.db"), {
			readonly: true,
			fileMustExist: true,
		});
		const cutoffSeconds = Math.floor(cutoffMs / 1000);
		const sessions = db
			.prepare(
				`SELECT id, model, cwd, title,
				        MAX(started_at, COALESCE(ended_at, 0),
				            COALESCE(last_activity_at, 0)) AS activity_at,
				        input_tokens, output_tokens, cache_read_tokens,
				        cache_write_tokens, reasoning_tokens,
				        estimated_cost_usd, actual_cost_usd
				 FROM sessions
				 WHERE MAX(started_at, COALESCE(ended_at, 0),
				           COALESCE(last_activity_at, 0)) >= ?`,
			)
			.all(cutoffSeconds) as HermesSessionRow[];
		let modelRows: HermesModelUsageRow[] = [];
		try {
			modelRows = db
				.prepare(
					`SELECT session_id, model, last_seen,
					        input_tokens, output_tokens, cache_read_tokens,
					        cache_write_tokens, reasoning_tokens,
					        estimated_cost_usd, actual_cost_usd
					 FROM session_model_usage
					 WHERE session_id IN (
					   SELECT id FROM sessions
					   WHERE MAX(started_at, COALESCE(ended_at, 0),
					             COALESCE(last_activity_at, 0)) >= ?
					 )`,
				)
				.all(cutoffSeconds) as HermesModelUsageRow[];
		} catch {
			// Older Hermes databases have no session_model_usage table.
		}
		hermesRowsToEntries(sessions, modelRows, cutoffMs, out, sessionLabels);
		return 1;
	} catch {
		return 0;
	} finally {
		db?.close();
	}
}
