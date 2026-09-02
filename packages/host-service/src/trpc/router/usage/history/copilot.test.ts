import { describe, expect, test } from "bun:test";
import type { CopilotUsageRow } from "./copilot-rows";
import { copilotRowsToEntries } from "./copilot-rows";
import type { UsageLogEntry } from "./parse";

// Keep this test on the pure mapping module: the SQLite reader uses the
// Node-only better-sqlite3 native binding, while the unit suite runs in Bun.

function row(over: Partial<CopilotUsageRow> = {}): CopilotUsageRow {
	return {
		session_id: "sess-1",
		model: "claude-sonnet-4.5",
		input_tokens: 120,
		output_tokens: 300,
		cache_read_tokens: 800,
		cache_write_tokens: 40,
		reasoning_tokens: 60,
		created_at: "2026-08-20 12:00:00",
		cwd: "/tmp/proj",
		summary: "Debug the login flow",
		...over,
	};
}

describe("copilotRowsToEntries", () => {
	test("maps usage rows joined with their session", () => {
		const out: UsageLogEntry[] = [];
		const labels = new Map<string, string>();
		copilotRowsToEntries([row()], 0, out, labels);
		expect(out).toHaveLength(1);
		expect(out[0]).toMatchObject({
			agent: "copilot",
			model: "claude-sonnet-4.5",
			cwd: "/tmp/proj",
			sessionId: "sess-1",
			uncachedInput: 120,
			cachedInput: 800,
			cacheWrite5m: 40,
			output: 300,
			reasoningOutput: 60,
			// created_at is SQLite's datetime('now') — UTC without a marker.
			timestampMs: Date.parse("2026-08-20T12:00:00.000Z"),
		});
		expect(labels.get("sess-1")).toBe("Debug the login flow");
	});

	test("respects the cutoff and tolerates null columns", () => {
		const out: UsageLogEntry[] = [];
		copilotRowsToEntries(
			[
				row({ created_at: "2026-08-01 12:00:00" }),
				row({ created_at: null }),
				row({ session_id: null, cwd: null, summary: null, model: null }),
			],
			Date.parse("2026-08-10T00:00:00.000Z"),
			out,
		);
		expect(out).toHaveLength(1);
		expect(out[0]).toMatchObject({
			sessionId: "unknown",
			model: "unknown",
			cwd: null,
		});
	});
});
