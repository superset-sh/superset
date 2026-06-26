import { describe, expect, it } from "bun:test";
import { formatClockLine, formatPomodoroLine } from "./card-line-format";

const MINUTE = 60_000;

describe("formatPomodoroLine", () => {
	it("formats hours, cycle position, and pomodoro number", () => {
		// 2h13m = 133 minutes: 133 % 25 = 8, floor(133 / 25) + 1 = 6
		expect(formatPomodoroLine(0, 133 * MINUTE)).toBe(
			"⏱ 2h13m · 🍅 8/25m · pomo #6",
		);
	});

	it("omits hours under one hour", () => {
		expect(formatPomodoroLine(0, 13 * MINUTE)).toBe(
			"⏱ 13m · 🍅 13/25m · pomo #1",
		);
	});

	it("rolls into the next pomodoro at each 25-minute boundary", () => {
		expect(formatPomodoroLine(0, 25 * MINUTE)).toBe(
			"⏱ 25m · 🍅 0/25m · pomo #2",
		);
	});

	it("clamps negative elapsed time (clock skew) to zero", () => {
		expect(formatPomodoroLine(10 * MINUTE, 0)).toBe(
			"⏱ 0m · 🍅 0/25m · pomo #1",
		);
	});
});

describe("formatClockLine", () => {
	it("formats local time as zero-padded HH:MM", () => {
		const at = new Date(2026, 5, 7, 9, 5).getTime();
		expect(formatClockLine(at)).toBe("09:05");
	});
});
