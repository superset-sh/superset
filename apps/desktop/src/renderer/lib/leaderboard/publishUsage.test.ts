import { describe, expect, test } from "bun:test";
import { MAX_BACKFILL_DAYS } from "@superset/trpc/leaderboard-periods";
import { chunkRows, launchBackfillDays } from "./publishUsage";

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

describe("launchBackfillDays", () => {
	test("reaches launch day", () => {
		expect(launchBackfillDays(new Date("2026-09-18T12:00:00.000Z"))).toBe(52);
	});

	test("stops at the host's ceiling once launch is older", () => {
		expect(launchBackfillDays(new Date("2027-09-18T12:00:00.000Z"))).toBe(
			MAX_BACKFILL_DAYS,
		);
	});

	test("never asks the host for a window it would reject", () => {
		for (const day of [
			"2026-07-29",
			"2026-10-26",
			"2026-10-27",
			"2027-01-01",
			"2030-01-01",
		]) {
			expect(
				launchBackfillDays(new Date(`${day}T12:00:00.000Z`)),
			).toBeLessThanOrEqual(MAX_BACKFILL_DAYS);
		}
	});
});
