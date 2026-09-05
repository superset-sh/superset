import { describe, expect, test } from "bun:test";

import { pivotWeekly, startOfWeek, weekStarts } from "./weeks";

describe("startOfWeek", () => {
	test("returns the Monday of the containing week in UTC", () => {
		expect(startOfWeek(new Date("2026-09-05T10:00:00Z"))).toBe("2026-08-31");
		expect(startOfWeek(new Date("2026-08-31T00:00:00Z"))).toBe("2026-08-31");
		expect(startOfWeek(new Date("2026-09-06T23:59:59Z"))).toBe("2026-08-31");
	});
});

describe("weekStarts", () => {
	test("lists consecutive Mondays ending with the current week", () => {
		expect(weekStarts(3, new Date("2026-09-05T10:00:00Z"))).toEqual([
			"2026-08-17",
			"2026-08-24",
			"2026-08-31",
		]);
	});
});

describe("pivotWeekly", () => {
	const weeks = ["2026-08-17", "2026-08-24", "2026-08-31"];

	test("fills missing weeks with zeros and orders series by total", () => {
		const table = pivotWeekly(
			[
				["2026-08-17", "a", 1],
				["2026-08-31", "a", 2],
				["2026-08-24", "b", 10],
			],
			weeks,
		);
		expect(table).toEqual({
			weeks,
			series: [
				{ key: "b", values: [0, 10, 0] },
				{ key: "a", values: [1, 0, 2] },
			],
		});
	});

	test("honours an explicit order before falling back to totals", () => {
		const table = pivotWeekly(
			[
				["2026-08-17", "a", 1],
				["2026-08-17", "b", 10],
				["2026-08-17", "c", 5],
			],
			weeks,
			{ order: ["a"] },
		);
		expect(table.series.map((s) => s.key)).toEqual(["a", "b", "c"]);
	});

	test("ignores rows outside the requested weeks", () => {
		const table = pivotWeekly([["2026-01-05", "a", 1]], weeks);
		expect(table.series).toEqual([]);
	});

	test("folds series past the limit into an overflow series", () => {
		const table = pivotWeekly(
			[
				["2026-08-17", "a", 10],
				["2026-08-17", "b", 5],
				["2026-08-24", "c", 2],
				["2026-08-24", "d", 1],
			],
			weeks,
			{ limit: 2, overflowKey: "other" },
		);
		expect(table.series).toEqual([
			{ key: "a", values: [10, 0, 0] },
			{ key: "b", values: [5, 0, 0] },
			{ key: "other", values: [0, 3, 0] },
		]);
	});

	test("folds overflow into an existing series with the overflow key", () => {
		const table = pivotWeekly(
			[
				["2026-08-17", "Google", 10],
				["2026-08-17", "Other", 5],
				["2026-08-24", "Bing", 2],
			],
			weeks,
			{ limit: 2, overflowKey: "Other" },
		);
		expect(table.series).toEqual([
			{ key: "Google", values: [10, 0, 0] },
			{ key: "Other", values: [5, 2, 0] },
		]);
	});
});
