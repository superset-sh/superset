import { describe, expect, test } from "bun:test";
import { daysSinceLaunch, resolveDayRange, resolveWindow } from "./periods";

const THURSDAY = new Date("2026-08-20T12:00:00.000Z");

describe("resolveDayRange", () => {
	test("all-time has no range, so callers read the rolled-up totals", () => {
		expect(resolveDayRange("all", undefined, THURSDAY)).toBeNull();
	});

	test("day is a single inclusive key", () => {
		expect(resolveDayRange("day", undefined, THURSDAY)).toEqual({
			from: "2026-08-20",
			to: "2026-08-20",
		});
	});

	test("week runs Monday to Sunday, not Sunday to Saturday", () => {
		expect(resolveDayRange("week", undefined, THURSDAY)).toEqual({
			from: "2026-08-17",
			to: "2026-08-23",
		});
	});

	test("a Monday anchor is the start of its own week, not the previous one", () => {
		expect(resolveDayRange("week", "2026-08-17", THURSDAY)).toEqual({
			from: "2026-08-17",
			to: "2026-08-23",
		});
	});

	test("a Sunday anchor belongs to the week that began six days earlier", () => {
		expect(resolveDayRange("week", "2026-08-23", THURSDAY)).toEqual({
			from: "2026-08-17",
			to: "2026-08-23",
		});
	});

	test("week spanning a month boundary keeps both months", () => {
		expect(resolveDayRange("week", "2026-09-01", THURSDAY)).toEqual({
			from: "2026-08-31",
			to: "2026-09-06",
		});
	});

	test("month covers the calendar month containing the anchor", () => {
		expect(resolveDayRange("month", undefined, THURSDAY)).toEqual({
			from: "2026-08-01",
			to: "2026-08-31",
		});
	});

	test("month handles 30-day months", () => {
		expect(resolveDayRange("month", "2026-09-15", THURSDAY)).toEqual({
			from: "2026-09-01",
			to: "2026-09-30",
		});
	});

	test("month handles a leap February", () => {
		expect(resolveDayRange("month", "2028-02-10", THURSDAY)).toEqual({
			from: "2028-02-01",
			to: "2028-02-29",
		});
	});

	test("anchors are interpreted as UTC midnight, never local", () => {
		expect(resolveDayRange("day", "2026-08-20", THURSDAY)).toEqual({
			from: "2026-08-20",
			to: "2026-08-20",
		});
	});

	test("rejects a malformed anchor rather than silently using today", () => {
		expect(() => resolveDayRange("day", "not-a-date", THURSDAY)).toThrow();
	});
});

describe("rolling windows", () => {
	test("7d ends on the anchor and spans seven days inclusive", () => {
		expect(resolveDayRange("7d", undefined, THURSDAY)).toEqual({
			from: "2026-08-14",
			to: "2026-08-20",
		});
	});

	test("30d spans thirty days inclusive", () => {
		expect(resolveDayRange("30d", undefined, THURSDAY)).toEqual({
			from: "2026-07-22",
			to: "2026-08-20",
		});
	});

	test("rolling windows cross month boundaries without truncating", () => {
		expect(resolveDayRange("7d", "2026-09-03", THURSDAY)).toEqual({
			from: "2026-08-28",
			to: "2026-09-03",
		});
	});
});

describe("resolveWindow", () => {
	test("an explicit range beats the named period", () => {
		expect(
			resolveWindow({
				period: "month",
				from: "2026-01-05",
				to: "2026-01-09",
				now: THURSDAY,
			}),
		).toEqual({ from: "2026-01-05", to: "2026-01-09" });
	});

	test("a backwards range is normalised rather than returning nothing", () => {
		expect(
			resolveWindow({
				period: "month",
				from: "2026-01-09",
				to: "2026-01-05",
				now: THURSDAY,
			}),
		).toEqual({ from: "2026-01-05", to: "2026-01-09" });
	});

	test("a half-specified range falls back to the period", () => {
		expect(
			resolveWindow({ period: "day", from: "2026-01-09", now: THURSDAY }),
		).toEqual({ from: "2026-08-20", to: "2026-08-20" });
	});

	test("all-time stays rangeless even alongside a period start", () => {
		expect(
			resolveWindow({
				period: "all",
				periodStart: "2026-01-01",
				now: THURSDAY,
			}),
		).toBeNull();
	});

	test("caps an oversized explicit range at MAX_WINDOW_DAYS", () => {
		expect(
			resolveWindow({ period: "all", from: "1900-01-01", to: "2026-08-25" }),
		).toEqual({ from: "2025-08-25", to: "2026-08-25" });
	});

	test("leaves a range inside the cap untouched", () => {
		expect(
			resolveWindow({ period: "all", from: "2026-08-01", to: "2026-08-25" }),
		).toEqual({ from: "2026-08-01", to: "2026-08-25" });
	});

	test("caps a reversed oversized range after ordering it", () => {
		expect(
			resolveWindow({ period: "all", from: "2026-08-25", to: "1900-01-01" }),
		).toEqual({ from: "2025-08-25", to: "2026-08-25" });
	});
});

describe("daysSinceLaunch", () => {
	test("counts launch day itself, so a same-day join still asks for it", () => {
		expect(daysSinceLaunch(new Date("2026-07-29T23:59:00.000Z"))).toBe(1);
	});

	test("is inclusive of both ends", () => {
		expect(daysSinceLaunch(new Date("2026-07-31T00:00:00.000Z"))).toBe(3);
	});

	test("reaches past the 30-day backfill once launch is that old", () => {
		expect(daysSinceLaunch(new Date("2026-09-18T12:00:00.000Z"))).toBe(52);
	});

	test("ignores the local clock's offset from UTC", () => {
		expect(daysSinceLaunch(new Date("2026-08-01T00:30:00.000Z"))).toBe(
			daysSinceLaunch(new Date("2026-08-01T23:30:00.000Z")),
		);
	});

	test("a clock set before launch still asks for one day", () => {
		expect(daysSinceLaunch(new Date("2026-01-01T00:00:00.000Z"))).toBe(1);
	});
});
