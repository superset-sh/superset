import { describe, expect, test } from "bun:test";
import { groupFactoryDays } from "./factory-days";
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

const at = (iso: string, sessionId: string) =>
	entry({ timestampMs: Date.parse(iso), sessionId });

function oneDay(
	entries: UsageLogEntry[],
	agentPrsByDay?: Record<string, number>,
) {
	const day = groupFactoryDays(entries, agentPrsByDay)[0];
	if (!day) throw new Error("expected one day");
	return day;
}

describe("groupFactoryDays", () => {
	test("counts a session once even when it switches model", () => {
		const day = oneDay([
			entry({ model: "claude-opus-5", sessionId: "s1" }),
			entry({ model: "claude-sonnet-5", sessionId: "s1" }),
		]);
		expect(day.sessions).toBe(1);
	});

	test("sessions in the same bucket are parallel", () => {
		const day = oneDay([
			at("2026-08-20T12:00:00Z", "s1"),
			at("2026-08-20T12:05:00Z", "s2"),
			at("2026-08-20T12:10:00Z", "s3"),
		]);
		expect(day.parallelSessions).toBe(3);
	});

	test("sessions in different buckets are not parallel", () => {
		const day = oneDay([
			at("2026-08-20T12:00:00Z", "s1"),
			at("2026-08-20T13:00:00Z", "s2"),
			at("2026-08-20T14:00:00Z", "s3"),
		]);
		expect(day.sessions).toBe(3);
		expect(day.parallelSessions).toBe(1);
	});

	test("takes the median across active buckets, not the peak", () => {
		const day = oneDay([
			at("2026-08-20T12:00:00Z", "s1"),
			at("2026-08-20T12:01:00Z", "s2"),
			at("2026-08-20T12:02:00Z", "s3"),
			at("2026-08-20T12:03:00Z", "s4"),
			at("2026-08-20T13:00:00Z", "s5"),
			at("2026-08-20T14:00:00Z", "s6"),
		]);
		expect(day.parallelSessions).toBe(1);
	});

	test("an even bucket count can land on a half", () => {
		const day = oneDay([
			at("2026-08-20T12:00:00Z", "s1"),
			at("2026-08-20T12:01:00Z", "s2"),
			at("2026-08-20T13:00:00Z", "s3"),
		]);
		expect(day.parallelSessions).toBe(1.5);
	});

	test("splits on the UTC day boundary, not local", () => {
		const days = groupFactoryDays([
			at("2026-08-20T23:50:00Z", "s1"),
			at("2026-08-21T00:10:00Z", "s2"),
		]);
		expect(days.map((d) => d.day)).toEqual(["2026-08-20", "2026-08-21"]);
	});

	test("attaches merged PR counts to their day", () => {
		const day = oneDay([at("2026-08-20T12:00:00Z", "s1")], {
			"2026-08-20": 4,
		});
		expect(day.agentPrsMerged).toBe(4);
	});

	test("keeps a day that merged PRs but logged no usage", () => {
		const days = groupFactoryDays([], { "2026-08-19": 2 });
		expect(days).toEqual([
			{
				day: "2026-08-19",
				sessions: 0,
				parallelSessions: 0,
				agentPrsMerged: 2,
			},
		]);
	});

	test("publishes no session identifiers", () => {
		const days = groupFactoryDays([at("2026-08-20T12:00:00Z", "secret-id")]);
		expect(JSON.stringify(days)).not.toContain("secret-id");
	});
});
