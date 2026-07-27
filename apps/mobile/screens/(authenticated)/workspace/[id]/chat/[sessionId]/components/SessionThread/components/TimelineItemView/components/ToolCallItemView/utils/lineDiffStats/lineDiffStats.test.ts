import { describe, expect, test } from "bun:test";
import { lineDiffStats } from "./lineDiffStats";

describe("lineDiffStats", () => {
	test("Edit: pure insertion counts only added lines", () => {
		expect(
			lineDiffStats("Edit", {
				file_path: "/x/LOG.md",
				old_string: "rep-19",
				new_string: "rep-19\nrep-20-polish",
			}),
		).toEqual({ additions: 1, deletions: 0 });
	});

	test("Edit: replacement counts both sides after prefix/suffix trim", () => {
		expect(
			lineDiffStats("Edit", {
				old_string: "a\nb\nc\nd",
				new_string: "a\nX\nY\nZ\nd",
			}),
		).toEqual({ additions: 3, deletions: 2 });
	});

	test("Edit: identical strings diff to zero", () => {
		expect(
			lineDiffStats("Edit", {
				old_string: "same\nlines",
				new_string: "same\nlines",
			}),
		).toEqual({ additions: 0, deletions: 0 });
	});

	test("Write counts content lines git-style (trailing newline ends a line)", () => {
		expect(lineDiffStats("Write", { content: "one\ntwo\n" })).toEqual({
			additions: 2,
			deletions: 0,
		});
		expect(lineDiffStats("Write", { content: "one\ntwo" })).toEqual({
			additions: 2,
			deletions: 0,
		});
		expect(lineDiffStats("Write", { content: "" })).toEqual({
			additions: 0,
			deletions: 0,
		});
	});

	test("MultiEdit sums per-edit stats", () => {
		expect(
			lineDiffStats("MultiEdit", {
				edits: [
					{ old_string: "a", new_string: "a\nb" },
					{ old_string: "x\ny", new_string: "z" },
				],
			}),
		).toEqual({ additions: 2, deletions: 2 });
	});

	test("non-file tools and malformed input return null", () => {
		expect(lineDiffStats("Bash", { command: "ls" })).toBeNull();
		expect(lineDiffStats("Edit", { old_string: "a" })).toBeNull();
		expect(lineDiffStats("Edit", null)).toBeNull();
		expect(lineDiffStats("Write", { content: 42 })).toBeNull();
	});
});
