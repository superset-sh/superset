import { describe, expect, test } from "bun:test";
import {
	HOST_SERVICE_RESPAWN_BASE_DELAY_MS,
	HOST_SERVICE_RESPAWN_MAX_ATTEMPTS,
	HOST_SERVICE_RESPAWN_MAX_DELAY_MS,
	nextRespawnDelayMs,
} from "./host-service-respawn";

describe("nextRespawnDelayMs", () => {
	test("grows exponentially from the base delay", () => {
		// random = 0.5 puts the jitter at exactly 1x so the progression is visible.
		expect(nextRespawnDelayMs(1, 0.5)).toBe(HOST_SERVICE_RESPAWN_BASE_DELAY_MS);
		expect(nextRespawnDelayMs(2, 0.5)).toBe(
			HOST_SERVICE_RESPAWN_BASE_DELAY_MS * 2,
		);
		expect(nextRespawnDelayMs(3, 0.5)).toBe(
			HOST_SERVICE_RESPAWN_BASE_DELAY_MS * 4,
		);
	});

	test("treats a zero attempt count as the first band, never sub-floor", () => {
		expect(nextRespawnDelayMs(0, 0.5)).toBe(HOST_SERVICE_RESPAWN_BASE_DELAY_MS);
	});

	test("caps the delay once the exponent outgrows it", () => {
		// Unjittered so this asserts the cap itself: step 6 wants 32s, step 7 64s.
		expect(nextRespawnDelayMs(6, 0.5)).toBe(HOST_SERVICE_RESPAWN_MAX_DELAY_MS);
		expect(nextRespawnDelayMs(7, 0.5)).toBe(HOST_SERVICE_RESPAWN_MAX_DELAY_MS);
	});

	test("spends its whole budget over minutes, not seconds", () => {
		// The point of the budget: host-service often dies with a dependency
		// (database, Docker) that takes longer to come back than a few seconds.
		let total = 0;
		for (
			let attempt = 0;
			attempt < HOST_SERVICE_RESPAWN_MAX_ATTEMPTS;
			attempt++
		) {
			total += nextRespawnDelayMs(attempt, 0.5) as number;
		}
		expect(total).toBeGreaterThan(60_000);
	});

	test("applies symmetric jitter around the backoff", () => {
		const base = HOST_SERVICE_RESPAWN_BASE_DELAY_MS;
		expect(nextRespawnDelayMs(1, 0)).toBe(base * 0.5);
		expect(nextRespawnDelayMs(1, 0.5)).toBe(base);
		expect(nextRespawnDelayMs(1, 1)).toBe(base * 1.5);
	});

	test("never exceeds the cap even at the top of the jitter band", () => {
		for (
			let attempt = 0;
			attempt < HOST_SERVICE_RESPAWN_MAX_ATTEMPTS;
			attempt++
		) {
			const delay = nextRespawnDelayMs(attempt, 1);
			expect(delay).not.toBeNull();
			expect(delay as number).toBeLessThanOrEqual(
				HOST_SERVICE_RESPAWN_MAX_DELAY_MS,
			);
		}
	});

	test("returns null once the attempt budget is spent", () => {
		expect(
			nextRespawnDelayMs(HOST_SERVICE_RESPAWN_MAX_ATTEMPTS, 0.5),
		).toBeNull();
		expect(
			nextRespawnDelayMs(HOST_SERVICE_RESPAWN_MAX_ATTEMPTS + 3, 0.5),
		).toBeNull();
	});
});
