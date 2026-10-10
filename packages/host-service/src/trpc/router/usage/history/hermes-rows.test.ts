import { describe, expect, test } from "bun:test";
import type { HermesModelUsageRow, HermesSessionRow } from "./hermes-rows";
import { hermesRowsToEntries } from "./hermes-rows";
import type { UsageLogEntry } from "./parse";

// Keep this test on the pure mapping module: the SQLite reader uses the
// Node-only better-sqlite3 native binding, while the unit suite runs in Bun.

const zero = {
	input_tokens: 0,
	output_tokens: 0,
	cache_read_tokens: 0,
	cache_write_tokens: 0,
	reasoning_tokens: 0,
	estimated_cost_usd: 0,
	actual_cost_usd: 0,
};

function session(over: Partial<HermesSessionRow> = {}): HermesSessionRow {
	return {
		...zero,
		id: "20260824_073317_28278b",
		model: "claude-sonnet-5",
		cwd: "/Users/me/proj",
		title: "Fix the flaky test",
		activity_at: 1787582303,
		...over,
	};
}

function modelRow(
	over: Partial<HermesModelUsageRow> = {},
): HermesModelUsageRow {
	return {
		...zero,
		session_id: "20260824_073317_28278b",
		model: "claude-sonnet-5",
		last_seen: 1787582300,
		...over,
	};
}

describe("hermesRowsToEntries", () => {
	test("maps each per-model row and adds only the unattributed session remainder", () => {
		const out: UsageLogEntry[] = [];
		const labels = new Map<string, string>();
		hermesRowsToEntries(
			[
				session({
					input_tokens: 1500,
					output_tokens: 300,
					cache_read_tokens: 9000,
					reasoning_tokens: 40,
				}),
			],
			[
				modelRow({
					input_tokens: 1000,
					output_tokens: 200,
					cache_read_tokens: 9000,
					cache_write_tokens: 50,
					reasoning_tokens: 40,
					estimated_cost_usd: 0.12,
				}),
				modelRow({
					model: "gpt-6",
					input_tokens: 200,
					output_tokens: 20,
					last_seen: 1787582100,
				}),
			],
			0,
			out,
			labels,
		);
		expect(out).toEqual([
			{
				agent: "hermes",
				model: "claude-sonnet-5",
				timestampMs: 1787582300 * 1000,
				cwd: "/Users/me/proj",
				sessionId: "20260824_073317_28278b",
				uncachedInput: 1000,
				cachedInput: 9000,
				cacheWrite5m: 50,
				cacheWrite1h: 0,
				output: 200,
				reasoningOutput: 40,
				costUsd: 0.12,
			},
			expect.objectContaining({
				model: "gpt-6",
				uncachedInput: 200,
				output: 20,
			}),
			expect.objectContaining({
				model: "claude-sonnet-5",
				timestampMs: 1787582303 * 1000,
				uncachedInput: 300,
				cachedInput: 0,
				cacheWrite5m: 0,
				output: 80,
				reasoningOutput: 0,
			}),
		]);
		expect(out[2]).not.toHaveProperty("costUsd");
		expect(labels.get("20260824_073317_28278b")).toBe("Fix the flaky test");
	});

	test("compares one resolved cost so an actual session total does not repeat estimated row costs", () => {
		const out: UsageLogEntry[] = [];
		hermesRowsToEntries(
			[session({ input_tokens: 1500, actual_cost_usd: 0.12 })],
			[modelRow({ input_tokens: 1000, estimated_cost_usd: 0.12 })],
			0,
			out,
		);
		expect(out.map((e) => [e.uncachedInput, e.costUsd])).toEqual([
			[1000, 0.12],
			[500, undefined],
		]);
	});

	test("keeps a session remainder that has a cost but no tokens", () => {
		const out: UsageLogEntry[] = [];
		hermesRowsToEntries(
			[session({ input_tokens: 1000, estimated_cost_usd: 0.5 })],
			[modelRow({ input_tokens: 1000, estimated_cost_usd: 0.2 })],
			0,
			out,
		);
		expect(out[1]).toMatchObject({ uncachedInput: 0, output: 0 });
		expect(out[1]?.costUsd).toBeCloseTo(0.3);
	});

	test("skips empty sessions, rows before the cutoff, and rows of unknown sessions", () => {
		const out: UsageLogEntry[] = [];
		hermesRowsToEntries(
			[session()],
			[
				modelRow({ session_id: "other", input_tokens: 10 }),
				modelRow({ input_tokens: 10, last_seen: 100 }),
			],
			1_000_000,
			out,
		);
		expect(out).toHaveLength(0);
	});
});
