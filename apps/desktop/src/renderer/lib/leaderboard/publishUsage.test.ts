import { describe, expect, test } from "bun:test";
import { BACKFILL_DAYS, backfillDays, chunkRows } from "./publishUsage";

const rows = (...days: string[]) => days.map((day) => ({ day }));

describe("chunkRows", () => {
	test("leaves a payload under the cap as one publish", () => {
		expect(chunkRows(rows("2026-07-29", "2026-07-30"), 10)).toEqual([
			rows("2026-07-29", "2026-07-30"),
		]);
	});

	test("an empty payload produces no publishes at all", () => {
		expect(chunkRows([], 10)).toEqual([]);
	});

	test("breaks between days so each publish counts whole days", () => {
		expect(
			chunkRows(rows("2026-07-29", "2026-07-29", "2026-07-30"), 2),
		).toEqual([rows("2026-07-29", "2026-07-29"), rows("2026-07-30")]);
	});

	test("starts a new chunk rather than splitting a day across two", () => {
		expect(
			chunkRows(rows("2026-07-29", "2026-07-30", "2026-07-30"), 2),
		).toEqual([rows("2026-07-29"), rows("2026-07-30", "2026-07-30")]);
	});

	test("splits a single day wider than the cap, which would be rejected whole", () => {
		expect(
			chunkRows(rows("2026-07-29", "2026-07-29", "2026-07-29"), 2),
		).toEqual([rows("2026-07-29", "2026-07-29"), rows("2026-07-29")]);
	});

	test("every chunk stays within the cap", () => {
		const many = Array.from({ length: 97 }, (_, index) => ({
			day: `2026-07-${String((index % 28) + 1).padStart(2, "0")}`,
		}));
		for (const chunk of chunkRows(many, 10)) {
			expect(chunk.length).toBeLessThanOrEqual(10);
		}
		expect(chunkRows(many, 10).flat()).toEqual(many);
	});
});

describe("backfillDays", () => {
	test("the narrow range is the unchanged 30-day window", () => {
		expect(backfillDays("recent", new Date("2026-09-18T12:00:00.000Z"))).toBe(
			BACKFILL_DAYS,
		);
	});

	test("the wide range reaches launch day", () => {
		expect(backfillDays("launch", new Date("2026-09-18T12:00:00.000Z"))).toBe(
			52,
		);
	});
});
