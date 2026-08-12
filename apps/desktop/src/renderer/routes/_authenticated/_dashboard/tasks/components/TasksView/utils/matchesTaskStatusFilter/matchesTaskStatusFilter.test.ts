import { describe, expect, test } from "bun:test";
import { matchesTaskStatusFilter } from "./matchesTaskStatusFilter";

describe("matchesTaskStatusFilter", () => {
	test("keeps Active as the combined Todo and In progress view", () => {
		expect(matchesTaskStatusFilter("unstarted", "active")).toBe(true);
		expect(matchesTaskStatusFilter("started", "active")).toBe(true);
		expect(matchesTaskStatusFilter("backlog", "active")).toBe(false);
	});

	test("supports every workflow status explicitly", () => {
		for (const status of [
			"backlog",
			"unstarted",
			"started",
			"completed",
			"canceled",
		] as const) {
			expect(matchesTaskStatusFilter(status, status)).toBe(true);
			expect(matchesTaskStatusFilter("other", status)).toBe(false);
		}
	});
});
