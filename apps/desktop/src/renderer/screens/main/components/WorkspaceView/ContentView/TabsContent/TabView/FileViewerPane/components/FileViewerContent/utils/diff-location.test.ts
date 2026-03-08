import { describe, expect, it } from "bun:test";
import type { FileContents } from "shared/changes-types";
import { mapDiffLocationToRawPosition } from "./diff-location";

describe("mapDiffLocationToRawPosition", () => {
	it("keeps addition-side clicks on the same modified line", () => {
		const contents: FileContents = {
			original: "one\ntwo\nthree",
			modified: "one\ntwo changed\nthree",
			language: "text",
		};

		expect(
			mapDiffLocationToRawPosition({
				contents,
				lineNumber: 2,
				side: "additions",
				lineType: "change-addition",
				column: 5,
			}),
		).toEqual({
			lineNumber: 2,
			column: 5,
		});
	});

	it("maps deletion-side clicks to the replacement start line", () => {
		const contents: FileContents = {
			original: "one\ntwo\nthree",
			modified: "one\ntwo changed\nthree",
			language: "text",
		};

		expect(
			mapDiffLocationToRawPosition({
				contents,
				lineNumber: 2,
				side: "deletions",
				lineType: "change-deletion",
			}),
		).toEqual({
			lineNumber: 2,
			column: 1,
		});
	});

	it("maps pure deletions to the insertion point in the modified file", () => {
		const contents: FileContents = {
			original: "one\ntwo\nthree\nfour",
			modified: "one\nfour",
			language: "text",
		};

		expect(
			mapDiffLocationToRawPosition({
				contents,
				lineNumber: 2,
				side: "deletions",
				lineType: "change-deletion",
			}),
		).toEqual({
			lineNumber: 2,
			column: 1,
		});
	});

	it("maps deletion-side context lines using old-to-new line translation", () => {
		const contents: FileContents = {
			original: "one\ntwo\nthree\nfour",
			modified: "zero\none\ntwo\nthree\nfour",
			language: "text",
		};

		expect(
			mapDiffLocationToRawPosition({
				contents,
				lineNumber: 4,
				side: "deletions",
				lineType: "context",
			}),
		).toEqual({
			lineNumber: 5,
			column: 1,
		});
	});

	it("maps old-side lines below the final hunk using the cumulative delta", () => {
		const contents: FileContents = {
			original: "one\ntwo\nthree\nfour\nfive",
			modified: "zero\none\ntwo\nthree\nfour\nfive",
			language: "text",
		};

		expect(
			mapDiffLocationToRawPosition({
				contents,
				lineNumber: 5,
				side: "deletions",
				lineType: "context",
			}),
		).toEqual({
			lineNumber: 6,
			column: 1,
		});
	});

	it("clamps columns to the target line length", () => {
		const contents: FileContents = {
			original: "alpha",
			modified: "beta",
			language: "text",
		};

		expect(
			mapDiffLocationToRawPosition({
				contents,
				lineNumber: 1,
				side: "additions",
				lineType: "change-addition",
				column: 99,
			}),
		).toEqual({
			lineNumber: 1,
			column: 5,
		});
	});
});
