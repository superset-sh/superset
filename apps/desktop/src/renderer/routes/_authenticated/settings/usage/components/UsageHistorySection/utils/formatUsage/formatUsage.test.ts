import { describe, expect, it } from "bun:test";
import { formatDayLabel, formatTokens, formatUsd } from "./formatUsage";

describe("formatUsd", () => {
	it("shows cents under $100", () => {
		expect(formatUsd(46.204)).toBe("$46.20");
		expect(formatUsd(0.851)).toBe("$0.85");
	});

	it("rounds to whole dollars at $100+", () => {
		expect(formatUsd(19211.2)).toBe("$19,211");
		expect(formatUsd(100)).toBe("$100");
	});
});

describe("formatTokens", () => {
	it("scales through K/M/B", () => {
		expect(formatTokens(13_930_000_000)).toBe("13.9B");
		expect(formatTokens(4_200_000)).toBe("4.2M");
		expect(formatTokens(850_000)).toBe("850K");
		expect(formatTokens(312)).toBe("312");
	});
});

describe("formatDayLabel", () => {
	it("formats bucket keys", () => {
		expect(formatDayLabel("2026-08-12")).toMatch(/Aug 12/);
	});

	it("passes through malformed keys", () => {
		expect(formatDayLabel("garbage")).toBe("garbage");
	});
});
