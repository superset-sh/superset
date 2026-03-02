import { describe, expect, it } from "bun:test";
import { getLineNumbersMinChars } from "./getLineNumbersMinChars";

describe("getLineNumbersMinChars", () => {
	it("returns 2 for single line files (1 digit + 1 gap)", () => {
		expect(getLineNumbersMinChars("line1", "line1")).toBe(2);
	});

	it("returns 2 for files with up to 9 lines", () => {
		const nineLines = "1\n2\n3\n4\n5\n6\n7\n8\n9";
		expect(getLineNumbersMinChars(nineLines, nineLines)).toBe(2);
	});

	it("returns 3 for files with 10-99 lines (2 digits + 1 gap)", () => {
		const tenLines = Array(10).fill("line").join("\n");
		expect(getLineNumbersMinChars(tenLines, tenLines)).toBe(3);

		const ninetyNineLines = Array(99).fill("line").join("\n");
		expect(getLineNumbersMinChars(ninetyNineLines, ninetyNineLines)).toBe(3);
	});

	it("returns 4 for files with 100-999 lines (3 digits + 1 gap)", () => {
		const hundredLines = Array(100).fill("line").join("\n");
		expect(getLineNumbersMinChars(hundredLines, hundredLines)).toBe(4);

		const nineHundredNinetyNineLines = Array(999).fill("line").join("\n");
		expect(
			getLineNumbersMinChars(
				nineHundredNinetyNineLines,
				nineHundredNinetyNineLines,
			),
		).toBe(4);
	});

	it("returns 5 for files with 1000+ lines (4 digits + 1 gap)", () => {
		const thousandLines = Array(1000).fill("line").join("\n");
		expect(getLineNumbersMinChars(thousandLines, thousandLines)).toBe(5);
	});

	it("uses the larger of original or modified line count", () => {
		const tenLines = Array(10).fill("line").join("\n");
		const hundredLines = Array(100).fill("line").join("\n");

		expect(getLineNumbersMinChars(tenLines, hundredLines)).toBe(4);
		expect(getLineNumbersMinChars(hundredLines, tenLines)).toBe(4);
	});

	it("handles empty strings (counts as 1 line)", () => {
		expect(getLineNumbersMinChars("", "")).toBe(2);
	});
});
