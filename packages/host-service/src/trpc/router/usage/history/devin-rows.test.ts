import { describe, expect, test } from "bun:test";
import type { DevinMessageRow } from "./devin-rows";
import { devinRowsToEntries } from "./devin-rows";
import type { UsageLogEntry } from "./parse";

// Keep this test on the pure mapping module: the SQLite reader uses the
// Node-only better-sqlite3 native binding, while the unit suite runs in Bun.

// Captured from Devin CLI 3000.10.21 after one `devin -p` turn.
const assistant = {
	message_id: "e623dac2-bd71-409b-9f36-6ce0f8088934",
	role: "assistant",
	content: "ok",
	metadata: {
		num_tokens: 44,
		request_id: "659e1c54-8668-4e5d-ade7-905c2c6e187b",
		metrics: {
			ttft_ms: 682,
			total_time_ms: 950,
			input_tokens: 3593,
			output_tokens: 44,
			cache_read_tokens: 11648,
			cache_creation_tokens: null,
		},
		finish_reason: "stop",
		created_at: "2026-09-12T16:20:15.689883Z",
		generation_model: "swe-1-6-slow",
	},
};

function row(
	message: Record<string, unknown>,
	over: Partial<DevinMessageRow> = {},
): DevinMessageRow {
	return {
		session_id: "ordinary-march",
		chat_message: JSON.stringify(message),
		created_at: 1789230015,
		working_directory: "/Users/me/proj",
		model: "swe-1-6-slow",
		title: "Reply with the single word ok and nothing else.",
		...over,
	};
}

describe("devinRowsToEntries", () => {
	test("maps one assistant request from its metrics and dedupes the duplicated node", () => {
		const out: UsageLogEntry[] = [];
		const labels = new Map<string, string>();
		devinRowsToEntries([row(assistant), row(assistant)], 0, out, labels);
		expect(out).toEqual([
			{
				agent: "devin",
				model: "swe-1-6-slow",
				timestampMs: Date.parse("2026-09-12T16:20:15.689883Z"),
				cwd: "/Users/me/proj",
				sessionId: "ordinary-march",
				uncachedInput: 3593,
				cachedInput: 11648,
				cacheWrite5m: 0,
				cacheWrite1h: 0,
				output: 44,
				reasoningOutput: 0,
			},
		]);
		expect(labels.get("ordinary-march")).toBe(
			"Reply with the single word ok and nothing else.",
		);
	});

	test("falls back to the row timestamp and session model when the message lacks them", () => {
		const out: UsageLogEntry[] = [];
		const {
			generation_model: _model,
			created_at: _at,
			...metadata
		} = assistant.metadata;
		devinRowsToEntries(
			[row({ ...assistant, metadata }, { model: "claude-opus-4.6" })],
			0,
			out,
		);
		expect(out[0]).toMatchObject({
			model: "claude-opus-4.6",
			timestampMs: 1789230015 * 1000,
		});
	});

	test("skips user rows, rows before the cutoff, missing metrics, and bad JSON", () => {
		const out: UsageLogEntry[] = [];
		devinRowsToEntries(
			[
				row({ role: "user", content: "hi" }),
				row({ ...assistant, metadata: { request_id: "x" } }),
				row(assistant, { chat_message: "{nope" }),
			],
			0,
			out,
		);
		expect(out).toHaveLength(0);
		devinRowsToEntries(
			[row(assistant)],
			Date.parse("2026-09-12T16:20:16Z"),
			out,
		);
		expect(out).toHaveLength(0);
	});
});
