import { describe, expect, test } from "bun:test";
import {
	buildCalendar,
	CALENDAR_LEVELS,
	CALENDAR_WEEKS,
	quartileLevel,
} from "./buildCalendar";

describe("quartileLevel", () => {
	const sorted = [1, 2, 3, 4, 5, 6, 7, 8];

	test("is zero for an empty day", () => {
		expect(quartileLevel(0, sorted)).toBe(0);
	});

	test("is zero when nothing is active", () => {
		expect(quartileLevel(5, [])).toBe(0);
	});

	test("never exceeds the level count", () => {
		expect(quartileLevel(8, sorted)).toBe(CALENDAR_LEVELS);
		expect(quartileLevel(1000, sorted)).toBe(CALENDAR_LEVELS);
	});

	test("puts the smallest active day on level one", () => {
		expect(quartileLevel(1, sorted)).toBe(1);
	});

	test("climbs with rank", () => {
		const levels = sorted.map((value) => quartileLevel(value, sorted));
		expect(levels).toEqual([1, 1, 2, 2, 3, 3, 4, 4]);
	});

	test("scales relatively, not absolutely", () => {
		const light = [100, 200, 300, 400];
		const heavy = [1e9, 2e9, 3e9, 4e9];
		expect(quartileLevel(400, light)).toBe(quartileLevel(4e9, heavy));
	});
});

describe("buildCalendar", () => {
	test("always returns a full grid", () => {
		const calendar = buildCalendar([], "2026-09-03");
		expect(calendar.weeks).toHaveLength(CALENDAR_WEEKS);
		for (const week of calendar.weeks) {
			expect(week).toHaveLength(7);
		}
	});

	test("starts each column on a Sunday", () => {
		const calendar = buildCalendar([], "2026-09-03");
		for (const week of calendar.weeks) {
			const first = week[0];
			expect(new Date(`${first?.day}T00:00:00Z`).getUTCDay()).toBe(0);
		}
	});

	test("marks days after today as out of range", () => {
		const calendar = buildCalendar([], "2026-09-03");
		const future = calendar.weeks.flat().filter((cell) => !cell.inRange);
		for (const cell of future) {
			expect(cell.day > "2026-09-03").toBe(true);
		}
	});

	test("places tokens on the right day", () => {
		const calendar = buildCalendar(
			[{ day: "2026-09-01", tokens: 500 }],
			"2026-09-03",
		);
		const cell = calendar.weeks.flat().find((c) => c.day === "2026-09-01");
		expect(cell?.tokens).toBe(500);
		expect(cell?.level).toBeGreaterThan(0);
	});

	test("sums duplicate rows for the same day", () => {
		const calendar = buildCalendar(
			[
				{ day: "2026-09-01", tokens: 300 },
				{ day: "2026-09-01", tokens: 200 },
			],
			"2026-09-03",
		);
		const cell = calendar.weeks.flat().find((c) => c.day === "2026-09-01");
		expect(cell?.tokens).toBe(500);
	});

	test("ignores days outside the window", () => {
		const calendar = buildCalendar(
			[{ day: "2019-01-01", tokens: 900 }],
			"2026-09-03",
		);
		expect(calendar.total).toBe(0);
		expect(calendar.activeDays).toBe(0);
	});

	test("reports max, total and active days over the window", () => {
		const calendar = buildCalendar(
			[
				{ day: "2026-09-01", tokens: 100 },
				{ day: "2026-09-02", tokens: 400 },
			],
			"2026-09-03",
		);
		expect(calendar.max).toBe(400);
		expect(calendar.total).toBe(500);
		expect(calendar.activeDays).toBe(2);
	});

	test("is empty-safe", () => {
		const calendar = buildCalendar([], "2026-09-03");
		expect(calendar.max).toBe(0);
		expect(calendar.total).toBe(0);
		expect(calendar.activeDays).toBe(0);
		expect(calendar.weeks.flat().every((cell) => cell.level === 0)).toBe(true);
	});

	test("covers a full year up to today", () => {
		const calendar = buildCalendar([], "2026-09-03");
		const days = calendar.weeks.flat();

		expect(days[0]?.day).toBe("2025-08-31");
		expect(days.some((cell) => cell.day === "2026-09-03")).toBe(true);
		expect(days).toHaveLength(CALENDAR_WEEKS * 7);
	});

	test("ends on the week containing today", () => {
		const calendar = buildCalendar([], "2026-09-03");
		const lastWeek = calendar.weeks.at(-1) ?? [];

		expect(lastWeek.some((cell) => cell.day === "2026-09-03")).toBe(true);
		expect(lastWeek.filter((cell) => cell.inRange).at(-1)?.day).toBe(
			"2026-09-03",
		);
	});
});
