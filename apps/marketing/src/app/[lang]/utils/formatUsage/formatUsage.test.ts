import { describe, expect, it } from "bun:test";
import {
	dayCount,
	formatCount,
	formatDayRange,
	formatUsd,
} from "./formatUsage";

describe("formatUsd", () => {
	it("scales through K/M", () => {
		expect(formatUsd(1_240_000)).toBe("$1.24M");
		expect(formatUsd(4_200)).toBe("$4.2K");
		expect(formatUsd(46.204)).toBe("$46.20");
	});

	it("promotes values that round up into the next unit", () => {
		expect(formatUsd(999_999)).toBe("$1.00M");
		expect(formatUsd(999_990)).toBe("$1.00M");
	});

	it("keeps values that stay inside their unit", () => {
		expect(formatUsd(1_000)).toBe("$1.0K");
		expect(formatUsd(999_400)).toBe("$999.4K");
		expect(formatUsd(1_000_000)).toBe("$1.00M");
	});

	it("accepts numeric strings and rejects junk", () => {
		expect(formatUsd("1240000")).toBe("$1.24M");
		expect(formatUsd("not a number")).toBe("$0");
	});
});

describe("formatCount", () => {
	it("scales through K/M", () => {
		expect(formatCount(4_200_000)).toBe("4.2M");
		expect(formatCount(4_200)).toBe("4.2K");
		expect(formatCount(312)).toBe("312");
	});

	it("promotes values that round up into the next unit", () => {
		expect(formatCount(999_999)).toBe("1.0M");
	});

	it("keeps values that stay inside their unit", () => {
		expect(formatCount(1_000)).toBe("1.0K");
		expect(formatCount(999_400)).toBe("999.4K");
		expect(formatCount(1_000_000)).toBe("1.0M");
	});
});

describe("formatDayRange", () => {
	it("renders the calendar days of the key, not a shifted local day", () => {
		expect(formatDayRange({ from: "2026-08-01", to: "2026-08-25" })).toBe(
			"Aug 1 – Aug 25",
		);
	});

	it("falls back to all time without a range", () => {
		expect(formatDayRange(null)).toBe("All time");
	});
});

describe("dayCount", () => {
	it("counts both endpoints", () => {
		expect(dayCount({ from: "2026-08-01", to: "2026-08-25" })).toBe(25);
		expect(dayCount({ from: "2026-08-25", to: "2026-08-25" })).toBe(1);
	});

	it("is zero without a range", () => {
		expect(dayCount(null)).toBe(0);
	});
});
