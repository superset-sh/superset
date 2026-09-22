import { describe, expect, it } from "bun:test";
import { formatResetIn, formatResetLabel } from "./formatResetIn";

const NOW = new Date("2026-08-16T12:00:00Z");

function at(offsetMinutes: number): Date {
	return new Date(NOW.getTime() + offsetMinutes * 60_000);
}

describe("formatResetIn", () => {
	it("formats minutes", () => {
		expect(formatResetIn(at(14), NOW)).toBe("14m");
	});

	it("formats hours and minutes", () => {
		expect(formatResetIn(at(3 * 60 + 12), NOW)).toBe("3h 12m");
	});

	it("formats whole hours without minutes", () => {
		expect(formatResetIn(at(2 * 60), NOW)).toBe("2h");
	});

	it("formats days and hours", () => {
		expect(formatResetIn(at(2 * 24 * 60 + 4 * 60), NOW)).toBe("2d 4h");
	});

	it("formats whole days without hours", () => {
		expect(formatResetIn(at(3 * 24 * 60), NOW)).toBe("3d");
	});

	it("returns now for past timestamps", () => {
		expect(formatResetIn(at(-5), NOW)).toBe("now");
		expect(formatResetIn(NOW, NOW)).toBe("now");
	});

	it("rounds partial minutes up", () => {
		expect(formatResetIn(new Date(NOW.getTime() + 30_000), NOW)).toBe("1m");
	});
});

describe("formatResetLabel", () => {
	it("uses clock time within 24h", () => {
		const label = formatResetLabel(at(3 * 60 + 12), NOW);
		expect(label).toStartWith("Resets in 3h 12m · ");
		expect(label).toMatch(/\d{1,2}:\d{2}/);
	});

	it("uses date beyond 24h", () => {
		const label = formatResetLabel(at(5 * 24 * 60 + 13 * 60), NOW);
		expect(label).toStartWith("Resets in 5d 13h · ");
		expect(label).toMatch(/Aug \d{1,2}/);
	});

	it("handles past timestamps", () => {
		expect(formatResetLabel(at(-1), NOW)).toBe("Resets now");
	});
});
