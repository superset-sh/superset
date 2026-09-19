import { describe, expect, test } from "bun:test";
import { LEADERBOARD_LAUNCH_DAY } from "./periods";
import { PUBLISH_WINDOW_DAYS, publishableDayFloor } from "./schema";

const at = (day: string) => new Date(`${day}T12:00:00.000Z`).getTime();

describe("publishableDayFloor", () => {
	test("holds at launch day once the rolling window has moved past it", () => {
		expect(publishableDayFloor(at("2026-09-18"))).toBe(LEADERBOARD_LAUNCH_DAY);
	});

	test("stays at launch day however far the board ages", () => {
		expect(publishableDayFloor(at("2028-01-01"))).toBe(LEADERBOARD_LAUNCH_DAY);
	});

	test("uses the rolling window while it still reaches before launch", () => {
		expect(publishableDayFloor(at("2026-08-10"))).toBe("2026-07-06");
	});

	test("the rolling window is the documented number of days back", () => {
		expect(publishableDayFloor(at("2026-08-10"))).toBe(
			new Date(at("2026-08-10") - PUBLISH_WINDOW_DAYS * 86_400_000)
				.toISOString()
				.slice(0, 10),
		);
	});
});
