import { describe, expect, it } from "bun:test";
import { formatDiffStats } from "./formatDiffStats";

describe("formatDiffStats", () => {
	it("returns an empty string when there are no changes", () => {
		expect(formatDiffStats(0, 0)).toBe("");
	});

	it("shows only additions when there are no deletions", () => {
		expect(formatDiffStats(12, 0)).toBe("+12");
	});

	it("shows only deletions when there are no additions", () => {
		expect(formatDiffStats(0, 3)).toBe("−3");
	});

	it("shows both when present", () => {
		expect(formatDiffStats(5, 2)).toBe("+5 −2");
	});
});
