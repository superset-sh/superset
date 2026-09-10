import { describe, expect, test } from "bun:test";

import { partitionDay } from "./partitionDay";

describe("partitionDay", () => {
	test("a timestamp truncated to milliseconds keeps its day", () => {
		// What the round trip actually does: the row holds microseconds, the
		// Date that comes back holds milliseconds.
		const stored = "2026-09-08T03:25:01.812344Z";

		expect(new Date(stored).toISOString()).toBe("2026-09-08T03:25:01.812Z");
		expect(partitionDay(new Date(stored))).toBe("2026-09-08");
	});

	test("the last microseconds of a day do not fall into the next one", () => {
		expect(partitionDay(new Date("2026-09-08T23:59:59.999999Z"))).toBe(
			"2026-09-08",
		);
	});

	test("the first microseconds of a day do not fall into the previous one", () => {
		expect(partitionDay(new Date("2026-09-08T00:00:00.000999Z"))).toBe(
			"2026-09-08",
		);
	});

	test("is the UTC day, not the day where this happens to run", () => {
		expect(partitionDay(new Date("2026-09-08T00:30:00.000Z"))).toBe(
			"2026-09-08",
		);
		expect(partitionDay(new Date("2026-09-08T23:30:00.000Z"))).toBe(
			"2026-09-08",
		);
	});
});
