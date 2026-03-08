import { describe, expect, test } from "bun:test";
import { toAfplayVolume, toPaplayVolume } from "./notification-sound";

/**
 * Reproduction tests for GitHub issue #2166:
 * "Can we have a way to adjust sound level?"
 *
 * Before the fix, playSoundFile always used the system default volume (no -v
 * flag passed to afplay, no --volume flag passed to paplay). Users on macOS
 * had no per-app mixing, so sounds would play at full system volume with no
 * way to turn them down except disabling sounds entirely.
 *
 * The fix adds notificationSoundVolume (0–100) to settings and maps it to
 * each platform's native volume argument.
 */

describe("toAfplayVolume", () => {
	test("maps 100% to 1.0 (afplay default/full volume)", () => {
		expect(toAfplayVolume(100)).toBe(1.0);
	});

	test("maps 50% to 0.5 (half volume)", () => {
		expect(toAfplayVolume(50)).toBe(0.5);
	});

	test("maps 0% to 0.0 (silent)", () => {
		expect(toAfplayVolume(0)).toBe(0.0);
	});

	test("clamps values above 100 to 1.0", () => {
		expect(toAfplayVolume(150)).toBe(1.0);
	});

	test("clamps negative values to 0.0", () => {
		expect(toAfplayVolume(-10)).toBe(0.0);
	});
});

describe("toPaplayVolume", () => {
	test("maps 100% to 65536 (PA_VOLUME_NORM / full volume)", () => {
		expect(toPaplayVolume(100)).toBe(65536);
	});

	test("maps 50% to 32768 (half volume)", () => {
		expect(toPaplayVolume(50)).toBe(32768);
	});

	test("maps 0% to 0 (silent)", () => {
		expect(toPaplayVolume(0)).toBe(0);
	});

	test("clamps values above 100 to 65536", () => {
		expect(toPaplayVolume(200)).toBe(65536);
	});

	test("clamps negative values to 0", () => {
		expect(toPaplayVolume(-5)).toBe(0);
	});
});
