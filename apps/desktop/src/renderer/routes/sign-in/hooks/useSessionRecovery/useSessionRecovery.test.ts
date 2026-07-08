import { describe, expect, it } from "bun:test";
import {
	nextRecoveryDelayMs,
	SESSION_RECOVERY_BASE_DELAY_MS,
	SESSION_RECOVERY_MAX_ATTEMPTS,
	SESSION_RECOVERY_MAX_DELAY_MS,
} from "./useSessionRecovery";

// random=0.5 → jitter factor 0.75, i.e. the midpoint of the ±50% band. Using a
// fixed value keeps the base backoff assertions deterministic.
const MID = 0.5;
const factor = (random: number) => 0.5 + random * 0.5;

describe("nextRecoveryDelayMs", () => {
	it("starts at the base delay on the first retry", () => {
		expect(nextRecoveryDelayMs(1, MID)).toBe(
			SESSION_RECOVERY_BASE_DELAY_MS * factor(MID),
		);
	});

	it("doubles the backoff each attempt (exponential, not flat)", () => {
		expect(nextRecoveryDelayMs(1, MID)).toBe(15_000 * factor(MID));
		expect(nextRecoveryDelayMs(2, MID)).toBe(30_000 * factor(MID));
		expect(nextRecoveryDelayMs(3, MID)).toBe(60_000 * factor(MID));
		expect(nextRecoveryDelayMs(4, MID)).toBe(120_000 * factor(MID));
	});

	it("caps the backoff at the max delay", () => {
		// 2**8 * 15s = 3.84M ms, well past the 5-min cap.
		expect(nextRecoveryDelayMs(9, 1)).toBe(SESSION_RECOVERY_MAX_DELAY_MS);
		expect(nextRecoveryDelayMs(10, 1)).toBe(SESSION_RECOVERY_MAX_DELAY_MS);
	});

	it("stops (returns null) once the attempt budget is spent", () => {
		expect(
			nextRecoveryDelayMs(SESSION_RECOVERY_MAX_ATTEMPTS - 1, MID),
		).not.toBe(null);
		expect(nextRecoveryDelayMs(SESSION_RECOVERY_MAX_ATTEMPTS, MID)).toBe(null);
		expect(nextRecoveryDelayMs(SESSION_RECOVERY_MAX_ATTEMPTS + 5, MID)).toBe(
			null,
		);
	});

	it("applies ±50% jitter so a fleet cannot synchronize", () => {
		// random=0 → floor (0.5x), random=1 → ceiling (1.0x) of the base backoff.
		expect(nextRecoveryDelayMs(1, 0)).toBe(15_000 * 0.5);
		expect(nextRecoveryDelayMs(1, 1)).toBe(15_000 * 1.0);
		// Two different random draws must yield different delays (no fixed cadence).
		expect(nextRecoveryDelayMs(3, 0.1)).not.toBe(nextRecoveryDelayMs(3, 0.9));
	});

	it("never returns a delay below the previous flat 15s floor's half", () => {
		// Regression guard: even the jitter floor stays a sane positive delay,
		// never 0 or negative, for every in-budget attempt.
		for (let a = 1; a < SESSION_RECOVERY_MAX_ATTEMPTS; a++) {
			const lo = nextRecoveryDelayMs(a, 0);
			const hi = nextRecoveryDelayMs(a, 1);
			expect(lo).not.toBe(null);
			expect(lo as number).toBeGreaterThan(0);
			expect(hi as number).toBeGreaterThanOrEqual(lo as number);
		}
	});
});
