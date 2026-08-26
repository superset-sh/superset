import { describe, expect, it } from "bun:test";
import { formatScaled } from "./format-scaled";
import { formatTokens } from "./format-tokens";

describe("formatTokens", () => {
	it("scales through K/M/B/T", () => {
		expect(formatTokens(1_240_000_000_000)).toBe("1.24T");
		expect(formatTokens(13_930_000_000)).toBe("13.9B");
		expect(formatTokens(4_200_000)).toBe("4.2M");
		expect(formatTokens(850_000)).toBe("850K");
		expect(formatTokens(312)).toBe("312");
	});

	it("groups raw counts under a thousand", () => {
		expect(formatTokens(0)).toBe("0");
		expect(formatTokens(999)).toBe("999");
	});

	it("promotes values that round up into the next unit", () => {
		expect(formatTokens(999_999)).toBe("1.0M");
		expect(formatTokens(999_999_999)).toBe("1.0B");
		expect(formatTokens(999_999_999_999)).toBe("1.00T");
	});

	it("keeps values that stay inside their unit", () => {
		expect(formatTokens(1_000)).toBe("1K");
		expect(formatTokens(999_400)).toBe("999K");
		expect(formatTokens(1_000_000)).toBe("1.0M");
		expect(formatTokens(1_000_000_000)).toBe("1.0B");
	});
});

describe("formatScaled", () => {
	const units = [
		{ limit: 1e6, suffix: "M", digits: 1 },
		{ limit: 1e3, suffix: "K", digits: 1 },
	];

	it("carries a rounded value into the next unit", () => {
		expect(formatScaled(999_999, units, String)).toBe("1.0M");
	});

	it("has no unit above the largest to carry into", () => {
		expect(formatScaled(999_999_999, units, String)).toBe("1000.0M");
	});

	it("hands values below the smallest unit to the base formatter", () => {
		expect(formatScaled(999, units, (v) => v.toFixed(2))).toBe("999.00");
	});
});
