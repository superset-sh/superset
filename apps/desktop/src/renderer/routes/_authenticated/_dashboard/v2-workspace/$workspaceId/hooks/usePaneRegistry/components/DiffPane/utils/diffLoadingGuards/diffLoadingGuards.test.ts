import { describe, expect, test } from "bun:test";
import type { FileContents, FileDiffMetadata } from "@pierre/diffs";
import { parsePatchFiles } from "@pierre/diffs";
import {
	isDiffContentStale,
	isDiffContentTooLarge,
	isGeneratedDiffFile,
} from "./diffLoadingGuards";

const FILE_PATH =
	"front_porch/modules/delinquency/liquidation/proceeds/internals/liquidation_proceeds_apply_state_machine.py";

/** The file as its patch was generated against: twelve numbered lines. */
const COMMITTED_LINES = Array.from(
	{ length: 12 },
	(_, index) => `committed_line_${String(index + 1).padStart(2, "0")}`,
);

function parsePatch(hunkHeader: string, hunkBody: string[]): FileDiffMetadata {
	const patch = [
		`diff --git a/${FILE_PATH} b/${FILE_PATH}`,
		`--- a/${FILE_PATH}`,
		`+++ b/${FILE_PATH}`,
		hunkHeader,
		...hunkBody,
		"",
	].join("\n");
	const fileDiff = parsePatchFiles(patch, "diff-loading-guards-test")[0]
		?.files[0];
	if (!fileDiff) throw new Error("fixture patch parsed into no file diff");
	return fileDiff;
}

function fileContents(lines: string[]): FileContents {
	return { name: FILE_PATH, contents: `${lines.join("\n")}\n` };
}

/** A hunk that rewrites the last three lines, so it runs to end-of-file on
 * both sides and leaves no trailing context. */
const REWRITES_TO_END_OF_FILE = parsePatch("@@ -7,6 +7,6 @@", [
	...COMMITTED_LINES.slice(6, 9).map((line) => ` ${line}`),
	...COMMITTED_LINES.slice(9).map((line) => `-${line}`),
	"+rewritten_line_10",
	"+rewritten_line_11",
	"+rewritten_line_12",
]);
const REWRITTEN_LINES = [
	...COMMITTED_LINES.slice(0, 9),
	"rewritten_line_10",
	"rewritten_line_11",
	"rewritten_line_12",
];

/** A pure-addition hunk appending three lines at end-of-file — the shape the
 * crash was reported against. */
const APPENDS_AT_END_OF_FILE = parsePatch("@@ -10,3 +10,6 @@", [
	...COMMITTED_LINES.slice(9).map((line) => ` ${line}`),
	"+appended_line_13",
	"+appended_line_14",
	"+appended_line_15",
]);
const APPENDED_LINES = [
	...COMMITTED_LINES,
	"appended_line_13",
	"appended_line_14",
	"appended_line_15",
];

/** A hunk in the middle of the file, leaving three lines of trailing context
 * on both sides — the region "expand hidden context" actually expands. */
const REWRITES_MIDDLE = parsePatch("@@ -4,6 +4,6 @@", [
	...COMMITTED_LINES.slice(3, 6).map((line) => ` ${line}`),
	...COMMITTED_LINES.slice(6, 9).map((line) => `-${line}`),
	"+rewritten_line_07",
	"+rewritten_line_08",
	"+rewritten_line_09",
]);
const MIDDLE_REWRITTEN_LINES = [
	...COMMITTED_LINES.slice(0, 6),
	"rewritten_line_07",
	"rewritten_line_08",
	"rewritten_line_09",
	...COMMITTED_LINES.slice(9),
];

describe("diff loading guards", () => {
	test("treats lockfiles and compiled artifacts as generated", () => {
		for (const path of [
			"bun.lock",
			"package-lock.json",
			"dist/app.js",
			"src/vendor/client.ts",
			"assets/app.min.css",
			"packages/i18n/locales/ja/messages.ts",
		]) {
			expect(isGeneratedDiffFile(path)).toBe(true);
		}
	});

	test("leaves ordinary source files alone", () => {
		for (const path of [
			"src/app.ts",
			"apps/desktop/src/renderer/index.tsx",
			"packages/i18n/src/locales.ts",
		]) {
			expect(isGeneratedDiffFile(path)).toBe(false);
		}
	});

	test("caps the contents hydration will pull in", () => {
		expect(
			isDiffContentTooLarge("a".repeat(250_000), "b".repeat(250_001)),
		).toBe(true);
		expect(
			isDiffContentTooLarge("a".repeat(250_000), "b".repeat(250_000)),
		).toBe(false);
	});

	test("accepts contents read at the revision the patch was generated from", () => {
		for (const [fileDiff, newLines] of [
			[REWRITES_TO_END_OF_FILE, REWRITTEN_LINES],
			[APPENDS_AT_END_OF_FILE, APPENDED_LINES],
			[REWRITES_MIDDLE, MIDDLE_REWRITTEN_LINES],
		] as const) {
			expect(
				isDiffContentStale(fileDiff, {
					oldFile: fileContents(COMMITTED_LINES),
					newFile: fileContents(newLines),
				}),
			).toBe(false);
		}
	});

	test("rejects contents read after the file grew past its patch", () => {
		// Three lines appended to the working tree after the patch was cached:
		// the new side runs three lines past the last hunk while the old side
		// ends exactly on it, which is the (additions=3, deletions=0) trailing
		// context mismatch @pierre/diffs throws on mid-layout.
		expect(
			isDiffContentStale(APPENDS_AT_END_OF_FILE, {
				oldFile: fileContents(COMMITTED_LINES),
				newFile: fileContents([
					...APPENDED_LINES,
					"written_after_the_patch_1",
					"written_after_the_patch_2",
					"written_after_the_patch_3",
				]),
			}),
		).toBe(true);
		expect(
			isDiffContentStale(REWRITES_TO_END_OF_FILE, {
				oldFile: fileContents(COMMITTED_LINES),
				newFile: fileContents([
					...REWRITTEN_LINES,
					"written_after_the_patch_1",
					"written_after_the_patch_2",
					"written_after_the_patch_3",
				]),
			}),
		).toBe(true);
	});

	test("rejects contents whose trailing context shrank past its patch", () => {
		expect(
			isDiffContentStale(REWRITES_MIDDLE, {
				oldFile: fileContents(COMMITTED_LINES),
				newFile: fileContents(MIDDLE_REWRITTEN_LINES.slice(0, -2)),
			}),
		).toBe(true);
	});

	test("rejects contents the host could not read at the patch's ref", () => {
		// loadFileDiffContent answers a failed `git show` with "" instead of an
		// error; hydrated from nothing, every hunk line is one @pierre/diffs
		// walks straight off the end of.
		const unreadable: FileContents = { name: FILE_PATH, contents: "" };
		expect(
			isDiffContentStale(REWRITES_MIDDLE, {
				oldFile: unreadable,
				newFile: unreadable,
			}),
		).toBe(true);
		expect(
			isDiffContentStale(REWRITES_MIDDLE, {
				oldFile: fileContents(COMMITTED_LINES),
				newFile: unreadable,
			}),
		).toBe(true);
	});

	test("rejects contents shorter than the patch's hunks", () => {
		expect(
			isDiffContentStale(REWRITES_MIDDLE, {
				oldFile: fileContents(COMMITTED_LINES.slice(0, 5)),
				newFile: fileContents(MIDDLE_REWRITTEN_LINES.slice(0, 5)),
			}),
		).toBe(true);
	});

	test("rejects contents whose lines moved under the patch", () => {
		// Two lines inserted at the top and two dropped at the bottom: same
		// length and the same trailing count, but the hunk's rows would show
		// lines the patch never described.
		expect(
			isDiffContentStale(REWRITES_MIDDLE, {
				oldFile: fileContents(COMMITTED_LINES),
				newFile: fileContents([
					"written_after_the_patch_1",
					"written_after_the_patch_2",
					...MIDDLE_REWRITTEN_LINES.slice(0, -2),
				]),
			}),
		).toBe(true);
	});

	test("rejects contents missing a side the diff needs", () => {
		expect(
			isDiffContentStale(REWRITES_TO_END_OF_FILE, {
				oldFile: null,
				newFile: fileContents(REWRITTEN_LINES),
			}),
		).toBe(true);
	});

	test("leaves the metadata partial so a rejected load keeps its patch hunks", () => {
		const fileDiff = parsePatch("@@ -10,3 +10,6 @@", [
			...COMMITTED_LINES.slice(9).map((line) => ` ${line}`),
			"+appended_line_13",
			"+appended_line_14",
			"+appended_line_15",
		]);
		const hunksBefore = fileDiff.hunks.length;
		isDiffContentStale(fileDiff, {
			oldFile: fileContents(COMMITTED_LINES),
			newFile: fileContents([...APPENDED_LINES, "written_after_the_patch"]),
		});
		expect(fileDiff.isPartial).toBe(true);
		expect(fileDiff.additionLines.length).toBeLessThan(APPENDED_LINES.length);
		expect(fileDiff.hunks).toHaveLength(hunksBefore);
	});
});
