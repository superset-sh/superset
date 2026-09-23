import { describe, expect, test } from "bun:test";
import { daysSinceLaunch } from "@superset/trpc/leaderboard-periods";
import { leaderboardPayloadInput } from "./usage";

const accepts = (days: number) =>
	leaderboardPayloadInput.safeParse({ days }).success;

describe("leaderboardPayloadInput", () => {
	test("accepts the widest backfill the join dialog can ask for", () => {
		expect(accepts(daysSinceLaunch())).toBe(true);
	});

	test("still accepts the 30-day window", () => {
		expect(accepts(30)).toBe(true);
	});

	test("tolerates a day of host/server clock skew past launch", () => {
		expect(accepts(daysSinceLaunch() + 1)).toBe(true);
	});

	test("rejects a window reaching before the board existed", () => {
		expect(accepts(daysSinceLaunch() + 2)).toBe(false);
	});

	test("rejects a non-window", () => {
		expect(accepts(0)).toBe(false);
		expect(accepts(-1)).toBe(false);
		expect(accepts(1.5)).toBe(false);
	});
});
