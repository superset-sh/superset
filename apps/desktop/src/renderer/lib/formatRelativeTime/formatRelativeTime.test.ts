import { describe, expect, it } from "bun:test";
import { formatRelativeTime } from "./formatRelativeTime";

describe("formatRelativeTime", () => {
	const NOW = 1700000000000; // Fixed timestamp for testing
	const MINUTE = 60 * 1000;
	const HOUR = 60 * MINUTE;
	const DAY = 24 * HOUR;

	// Mock Date.now for consistent tests
	const originalDateNow = Date.now;
	const mockNow = () => {
		Date.now = () => NOW;
	};
	const restoreNow = () => {
		Date.now = originalDateNow;
	};

	it('returns "now" for timestamps less than 1 minute ago', () => {
		mockNow();
		expect(formatRelativeTime(NOW)).toBe("now");
		expect(formatRelativeTime(NOW - 30 * 1000)).toBe("now"); // 30 seconds ago
		expect(formatRelativeTime(NOW - 59 * 1000)).toBe("now"); // 59 seconds ago
		restoreNow();
	});

	it("returns minutes for timestamps between 1-59 minutes ago", () => {
		mockNow();
		expect(formatRelativeTime(NOW - 1 * MINUTE)).toBe("1m");
		expect(formatRelativeTime(NOW - 5 * MINUTE)).toBe("5m");
		expect(formatRelativeTime(NOW - 30 * MINUTE)).toBe("30m");
		expect(formatRelativeTime(NOW - 59 * MINUTE)).toBe("59m");
		restoreNow();
	});

	it("returns hours for timestamps between 1-23 hours ago", () => {
		mockNow();
		expect(formatRelativeTime(NOW - 1 * HOUR)).toBe("1h");
		expect(formatRelativeTime(NOW - 5 * HOUR)).toBe("5h");
		expect(formatRelativeTime(NOW - 12 * HOUR)).toBe("12h");
		expect(formatRelativeTime(NOW - 23 * HOUR)).toBe("23h");
		restoreNow();
	});

	it("returns days for timestamps between 1-29 days ago", () => {
		mockNow();
		expect(formatRelativeTime(NOW - 1 * DAY)).toBe("1d");
		expect(formatRelativeTime(NOW - 7 * DAY)).toBe("7d");
		expect(formatRelativeTime(NOW - 14 * DAY)).toBe("14d");
		expect(formatRelativeTime(NOW - 29 * DAY)).toBe("29d");
		restoreNow();
	});

	it("returns months for timestamps 30+ days ago", () => {
		mockNow();
		expect(formatRelativeTime(NOW - 30 * DAY)).toBe("1mo");
		expect(formatRelativeTime(NOW - 60 * DAY)).toBe("2mo");
		expect(formatRelativeTime(NOW - 90 * DAY)).toBe("3mo");
		expect(formatRelativeTime(NOW - 365 * DAY)).toBe("12mo");
		restoreNow();
	});

	it("handles edge cases at boundaries", () => {
		mockNow();
		// Just under 1 hour should show 59m
		expect(formatRelativeTime(NOW - 59 * MINUTE - 59 * 1000)).toBe("59m");
		// Exactly 1 hour should show 1h
		expect(formatRelativeTime(NOW - 60 * MINUTE)).toBe("1h");
		// Just under 1 day should show 23h
		expect(formatRelativeTime(NOW - 23 * HOUR - 59 * MINUTE)).toBe("23h");
		// Exactly 1 day should show 1d
		expect(formatRelativeTime(NOW - 24 * HOUR)).toBe("1d");
		restoreNow();
	});
});
