import { describe, expect, test } from "bun:test";
import { groupEntriesByDay } from "./leaderboard-days";
import type { UsageLogEntry } from "./parse";

function entry(over: Partial<UsageLogEntry> = {}): UsageLogEntry {
	return {
		agent: "claude",
		model: "claude-opus-5",
		timestampMs: Date.parse("2026-08-20T12:00:00.000Z"),
		cwd: "/Users/someone/secret-project",
		sessionId: "session-a",
		uncachedInput: 100,
		cachedInput: 200,
		cacheWrite5m: 50,
		cacheWrite1h: 0,
		output: 400,
		reasoningOutput: 80,
		...over,
	};
}

describe("groupEntriesByDay", () => {
	test("sums the six dimensions per day/agent/model", () => {
		const [row] = groupEntriesByDay([entry(), entry()]);
		expect(row).toMatchObject({
			day: "2026-08-20",
			provider: "claude",
			model: "claude-opus-5",
			uncachedInput: 200,
			cachedInput: 400,
			cacheWrite5m: 100,
			cacheWrite1h: 0,
			output: 800,
			reasoningOutput: 160,
		});
	});

	test("a harness-reported cost replaces the rate estimate", () => {
		const [row] = groupEntriesByDay([
			entry({
				agent: "opencode",
				model: "some-unknown-model",
				costUsd: 1.25,
			}),
		]);
		expect(row?.usdEstimate).toBe(1.25);
		// Priced by the harness itself — not an approximation, even though the
		// model is absent from the rate table.
		expect(row?.approximate).toBe(false);
	});

	test("splits the same day across models", () => {
		const rows = groupEntriesByDay([
			entry(),
			entry({ model: "claude-sonnet-5" }),
		]);
		expect(rows).toHaveLength(2);
		expect(rows.map((r) => r.model).sort()).toEqual([
			"claude-opus-5",
			"claude-sonnet-5",
		]);
	});

	test("splits the same model across agents", () => {
		const rows = groupEntriesByDay([
			entry(),
			entry({ agent: "codex", model: "gpt-5.6" }),
		]);
		expect(rows).toHaveLength(2);
	});

	test("keys on the UTC day, not the host's local day", () => {
		const late = groupEntriesByDay([
			entry({ timestampMs: Date.parse("2026-08-20T23:30:00.000Z") }),
		]);
		expect(late[0]?.day).toBe("2026-08-20");

		const early = groupEntriesByDay([
			entry({ timestampMs: Date.parse("2026-08-21T00:30:00.000Z") }),
		]);
		expect(early[0]?.day).toBe("2026-08-21");
	});

	test("counts distinct sessions, and never emits their ids", () => {
		const rows = groupEntriesByDay([
			entry({ sessionId: "1f0e-aaaa" }),
			entry({ sessionId: "1f0e-aaaa" }),
			entry({ sessionId: "2a7b-bbbb" }),
		]);
		expect(rows[0]?.sessions).toBe(2);
		const serialized = JSON.stringify(rows);
		expect(serialized).not.toContain("1f0e-aaaa");
		expect(serialized).not.toContain("2a7b-bbbb");
	});

	test("carries no cwd, path or prompt into the payload", () => {
		const serialized = JSON.stringify(
			groupEntriesByDay([entry({ cwd: "/Users/someone/secret-project" })]),
		);
		expect(serialized).not.toContain("secret-project");
		expect(serialized).not.toContain("/Users");
	});

	test("prices via the model rate and rounds to six decimals", () => {
		const [row] = groupEntriesByDay([entry()]);
		expect(row?.usdEstimate).toBeGreaterThan(0);
		expect(
			String(row?.usdEstimate).split(".")[1]?.length ?? 0,
		).toBeLessThanOrEqual(6);
	});

	test("an unknown model taints the bucket as approximate", () => {
		const [known] = groupEntriesByDay([entry()]);
		expect(known?.approximate).toBe(false);

		const [unknown] = groupEntriesByDay([
			entry({ model: "claude-something-unreleased" }),
		]);
		expect(unknown?.approximate).toBe(true);
	});

	test("one approximate entry taints a bucket its peers share", () => {
		const rows = groupEntriesByDay([
			entry({ model: "totally-unknown" }),
			entry({ model: "totally-unknown" }),
		]);
		expect(rows[0]?.approximate).toBe(true);
	});

	test("returns nothing for no entries", () => {
		expect(groupEntriesByDay([])).toEqual([]);
	});

	test("orders by day then model so payloads diff cleanly", () => {
		const rows = groupEntriesByDay([
			entry({ timestampMs: Date.parse("2026-08-22T01:00:00.000Z") }),
			entry({
				timestampMs: Date.parse("2026-08-20T01:00:00.000Z"),
				model: "claude-sonnet-5",
			}),
			entry({ timestampMs: Date.parse("2026-08-20T01:00:00.000Z") }),
		]);
		expect(rows.map((r) => `${r.day}/${r.model}`)).toEqual([
			"2026-08-20/claude-opus-5",
			"2026-08-20/claude-sonnet-5",
			"2026-08-22/claude-opus-5",
		]);
	});
});
