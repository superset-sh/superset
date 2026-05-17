import { describe, expect, test } from "bun:test";
import { parseDiffFromFile } from "@pierre/diffs";
import { getRenderedDiffLineIndexes } from "./getRenderedDiffLineIndex";

describe("getRenderedDiffLineIndexes", () => {
	test("maps addition, deletion, and context lines to rendered diff rows", () => {
		const fileDiff = parseDiffFromFile(
			{ name: "example.ts", contents: "a\nb\nc" },
			{ name: "example.ts", contents: "a\nB\nc" },
		);

		expect(getRenderedDiffLineIndexes(fileDiff, 2, "deletions")).toEqual({
			unified: 1,
			split: 1,
		});
		expect(getRenderedDiffLineIndexes(fileDiff, 2, "additions")).toEqual({
			unified: 2,
			split: 1,
		});
		expect(getRenderedDiffLineIndexes(fileDiff, 3, "additions")).toEqual({
			unified: 3,
			split: 2,
		});
	});

	test("accounts for deleted rows before the focused line", () => {
		const oldLines = Array.from(
			{ length: 100 },
			(_, index) => `line ${index + 1}`,
		);
		const newLines = [...oldLines];
		newLines.splice(10, 30);
		newLines[59] = "line 90 changed";

		const fileDiff = parseDiffFromFile(
			{ name: "example.ts", contents: oldLines.join("\n") },
			{ name: "example.ts", contents: newLines.join("\n") },
		);

		expect(getRenderedDiffLineIndexes(fileDiff, 60, "additions")).toEqual({
			unified: 90,
			split: 89,
		});
	});
});
