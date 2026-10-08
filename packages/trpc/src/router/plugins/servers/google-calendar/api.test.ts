import { describe, expect, test } from "bun:test";
import { eventTime, freeSlots, instant } from "./api";

describe("event times", () => {
	test("a date is an all-day event", () => {
		expect(eventTime("2026-10-07", "start", "Asia/Kolkata")).toEqual({
			date: "2026-10-07",
		});
	});

	test("a local date-time takes the zone it is given", () => {
		expect(eventTime("2026-10-07T15:00:00", "start", "Asia/Kolkata")).toEqual({
			dateTime: "2026-10-07T15:00:00",
			timeZone: "Asia/Kolkata",
		});
	});

	test("a local date-time with no zone fails instead of guessing UTC", () => {
		expect(() => eventTime("2026-10-07T15:00:00", "start", undefined)).toThrow(
			/timeZone/,
		);
	});

	test("a range bound must carry an offset", () => {
		expect(instant("2026-10-07T09:00:00-07:00", "timeMin")).toBe(
			"2026-10-07T09:00:00-07:00",
		);
		expect(() => instant("2026-10-07", "timeMin")).toThrow(/UTC offset/);
		expect(() => instant("2026-10-07T15:00:00junk-07:00", "timeMin")).toThrow(
			/UTC offset/,
		);
	});
});

describe("free slots", () => {
	const hour = 3_600_000;

	test("returns the gaps between merged busy blocks that are long enough", () => {
		const slots = freeSlots(
			[
				{ start: 1 * hour, end: 2 * hour },
				{ start: 1.5 * hour, end: 3 * hour },
				{ start: 3.25 * hour, end: 4 * hour },
			],
			{ start: 0, end: 6 * hour },
			0.5 * hour,
		);
		expect(slots).toEqual([
			{ start: 0, end: 1 * hour },
			{ start: 4 * hour, end: 6 * hour },
		]);
	});

	test("clips busy time outside the range", () => {
		expect(
			freeSlots(
				[{ start: -hour, end: hour }],
				{ start: 0, end: 2 * hour },
				hour,
			),
		).toEqual([{ start: hour, end: 2 * hour }]);
	});
});
