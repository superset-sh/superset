import { describe, expect, it } from "bun:test";
import {
	applyJwtRefreshResult,
	JWT_REFRESH_CIRCUIT_COOLDOWN_MS,
	JWT_REFRESH_MAX_FAILURES,
	JWT_REFRESH_MIN_INTERVAL_MS,
	type JwtRefreshState,
	shouldAttemptJwtRefresh,
} from "./jwt-refresh";

const T0 = 1_000_000_000_000; // arbitrary fixed "now"
const state = (over: Partial<JwtRefreshState> = {}): JwtRefreshState => ({
	inFlight: false,
	lastAttemptAt: 0,
	consecutiveFailures: 0,
	...over,
});

describe("shouldAttemptJwtRefresh", () => {
	it("allows the first refresh from a fresh state", () => {
		expect(shouldAttemptJwtRefresh(state(), T0)).toBe(true);
	});

	it("blocks while a refresh is in flight (single-flight dedup)", () => {
		// Even with the whole cooldown elapsed, an in-flight refresh blocks —
		// this is what collapses a fleet of concurrent shape 401s into one call.
		expect(
			shouldAttemptJwtRefresh(state({ inFlight: true, lastAttemptAt: 0 }), T0),
		).toBe(false);
	});

	it("spaces refreshes by exponential backoff per failure", () => {
		// failures=1 → 2*MIN, failures=2 → 4*MIN.
		const oneFail = state({ consecutiveFailures: 1, lastAttemptAt: T0 });
		const gap1 = JWT_REFRESH_MIN_INTERVAL_MS * 2;
		expect(shouldAttemptJwtRefresh(oneFail, T0 + gap1 - 1)).toBe(false);
		expect(shouldAttemptJwtRefresh(oneFail, T0 + gap1)).toBe(true);

		const twoFail = state({ consecutiveFailures: 2, lastAttemptAt: T0 });
		const gap2 = JWT_REFRESH_MIN_INTERVAL_MS * 4;
		expect(shouldAttemptJwtRefresh(twoFail, T0 + gap2 - 1)).toBe(false);
		expect(shouldAttemptJwtRefresh(twoFail, T0 + gap2)).toBe(true);
	});

	it("opens a circuit after MAX_FAILURES and reopens only after cooldown", () => {
		const tripped = state({
			consecutiveFailures: JWT_REFRESH_MAX_FAILURES,
			lastAttemptAt: T0,
		});
		// Still within the cooldown → blocked (this is what actually stops the storm).
		expect(
			shouldAttemptJwtRefresh(
				tripped,
				T0 + JWT_REFRESH_CIRCUIT_COOLDOWN_MS - 1,
			),
		).toBe(false);
		// Cooldown elapsed → a single probe is allowed.
		expect(
			shouldAttemptJwtRefresh(tripped, T0 + JWT_REFRESH_CIRCUIT_COOLDOWN_MS),
		).toBe(true);
	});
});

describe("applyJwtRefreshResult", () => {
	it("resets the failure count on success and clears in-flight", () => {
		const next = applyJwtRefreshResult(
			state({ inFlight: true, consecutiveFailures: 3, lastAttemptAt: T0 }),
			true,
		);
		expect(next.consecutiveFailures).toBe(0);
		expect(next.inFlight).toBe(false);
		expect(next.lastAttemptAt).toBe(T0); // preserved — backoff timing depends on it
	});

	it("increments the failure count on failure and clears in-flight", () => {
		const next = applyJwtRefreshResult(
			state({ inFlight: true, consecutiveFailures: 3, lastAttemptAt: T0 }),
			false,
		);
		expect(next.consecutiveFailures).toBe(4);
		expect(next.inFlight).toBe(false);
		expect(next.lastAttemptAt).toBe(T0); // preserved — backoff timing depends on it
	});

	it("drives the circuit: MAX_FAILURES consecutive failures block refresh", () => {
		let s = state();
		for (let i = 0; i < JWT_REFRESH_MAX_FAILURES; i++) {
			s = applyJwtRefreshResult({ ...s, inFlight: true }, false);
		}
		expect(s.consecutiveFailures).toBe(JWT_REFRESH_MAX_FAILURES);
		// Immediately after the tripping failure, refresh is circuit-blocked.
		expect(shouldAttemptJwtRefresh({ ...s, lastAttemptAt: T0 }, T0 + 1)).toBe(
			false,
		);
	});
});
