import { describe, expect, it } from "bun:test";
import { formatPathWithLine } from "./useCopyPathWithLine";

describe("formatPathWithLine", () => {
	it("appends a single line when the selection stays on one line", () => {
		expect(
			formatPathWithLine("/repo/.prettierrc", { startLine: 9, endLine: 9 }),
		).toBe("/repo/.prettierrc:9");
	});

	it("appends a range when the selection spans multiple lines", () => {
		expect(
			formatPathWithLine("/repo/.prettierrc", { startLine: 9, endLine: 25 }),
		).toBe("/repo/.prettierrc:9-25");
	});

	it("falls back to the bare path without a selection", () => {
		expect(formatPathWithLine("/repo/.prettierrc", null)).toBe(
			"/repo/.prettierrc",
		);
		expect(formatPathWithLine("/repo/.prettierrc", undefined)).toBe(
			"/repo/.prettierrc",
		);
	});
});
