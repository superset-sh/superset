import type { UsageLogEntry } from "./parse";
import { num } from "./parse";

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
