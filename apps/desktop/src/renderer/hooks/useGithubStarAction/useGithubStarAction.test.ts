import { describe, expect, test } from "bun:test";
import {
	canActivateStarAction,
	msUntilUnstarGraceWindowCloses,
	shouldUnmuteOnUnstarredRead,
	UNSTAR_CONFIRM_DELAY_MS,
} from "./useGithubStarAction";

describe("canActivateStarAction", () => {
	test("only true for a confirmed not_starred read", () => {
		expect(canActivateStarAction("not_starred")).toBe(true);
		expect(canActivateStarAction("loading")).toBe(false);
		expect(canActivateStarAction("unknown")).toBe(false);
		expect(canActivateStarAction("starred")).toBe(false);
	});
});

describe("shouldUnmuteOnUnstarredRead", () => {
	test("ignores reads other than not_starred", () => {
		expect(
			shouldUnmuteOnUnstarredRead({
				completed: true,
				completedAt: 0,
				checkResult: "starred",
				now: 1_000_000,
			}),
		).toBe(false);
		expect(
			shouldUnmuteOnUnstarredRead({
				completed: true,
				completedAt: 0,
				checkResult: "unknown",
				now: 1_000_000,
			}),
		).toBe(false);
	});

	test("ignores a not_starred read while not currently completed", () => {
		expect(
			shouldUnmuteOnUnstarredRead({
				completed: false,
				completedAt: null,
				checkResult: "not_starred",
				now: 1_000_000,
			}),
		).toBe(false);
	});

	test("suppresses a not_starred read within the flaky-read grace window", () => {
		const completedAt = 1_000_000;
		expect(
			shouldUnmuteOnUnstarredRead({
				completed: true,
				completedAt,
				checkResult: "not_starred",
				now: completedAt + UNSTAR_CONFIRM_DELAY_MS - 1,
			}),
		).toBe(false);
	});

	test("trusts a not_starred read once the grace window has elapsed", () => {
		const completedAt = 1_000_000;
		expect(
			shouldUnmuteOnUnstarredRead({
				completed: true,
				completedAt,
				checkResult: "not_starred",
				now: completedAt + UNSTAR_CONFIRM_DELAY_MS + 1,
			}),
		).toBe(true);
	});

	test("trusts a not_starred read immediately for a null completedAt (pre-timestamp schema)", () => {
		expect(
			shouldUnmuteOnUnstarredRead({
				completed: true,
				completedAt: null,
				checkResult: "not_starred",
				now: 1_000_000,
			}),
		).toBe(true);
	});
});

describe("msUntilUnstarGraceWindowCloses", () => {
	test("returns null when not completed", () => {
		expect(
			msUntilUnstarGraceWindowCloses({
				completed: false,
				completedAt: null,
				now: 1_000_000,
			}),
		).toBeNull();
	});

	test("returns null for a pre-timestamp completedAt — nothing to schedule, shouldUnmuteOnUnstarredRead already trusts it immediately", () => {
		expect(
			msUntilUnstarGraceWindowCloses({
				completed: true,
				completedAt: null,
				now: 1_000_000,
			}),
		).toBeNull();
	});

	test("returns the remaining time while inside the grace window", () => {
		const completedAt = 1_000_000;
		const now = completedAt + 10_000;
		expect(
			msUntilUnstarGraceWindowCloses({ completed: true, completedAt, now }),
		).toBe(UNSTAR_CONFIRM_DELAY_MS - 10_000);
	});

	test("returns null once the grace window has already elapsed — nothing to schedule", () => {
		const completedAt = 1_000_000;
		const now = completedAt + UNSTAR_CONFIRM_DELAY_MS + 1;
		expect(
			msUntilUnstarGraceWindowCloses({ completed: true, completedAt, now }),
		).toBeNull();
	});
});
