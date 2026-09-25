import { describe, expect, it } from "bun:test";
import { canonicalizeTreePath, stripTrailingSlash } from "./treePaths";

describe("canonicalizeTreePath", () => {
	it("leaves file paths untouched", () => {
		expect(canonicalizeTreePath("notes.txt", false)).toEqual("notes.txt");
		expect(canonicalizeTreePath("src/notes.txt", false)).toEqual(
			"src/notes.txt",
		);
	});

	it("adds the trailing slash Pierre omits for directories", () => {
		expect(canonicalizeTreePath("Untitled", true)).toEqual("Untitled/");
		expect(canonicalizeTreePath(".claude", true)).toEqual(".claude/");
	});

	it("canonicalizes nested directory paths", () => {
		expect(canonicalizeTreePath("src/components/Button", true)).toEqual(
			"src/components/Button/",
		);
	});

	it("is idempotent on an already-canonical path", () => {
		expect(canonicalizeTreePath("Untitled/", true)).toEqual("Untitled/");
		expect(
			canonicalizeTreePath(canonicalizeTreePath("a/b", true), true),
		).toEqual("a/b/");
	});

	it("round-trips with stripTrailingSlash", () => {
		for (const path of ["Untitled", "src/components/Button", ".claude"]) {
			expect(stripTrailingSlash(canonicalizeTreePath(path, true))).toEqual(
				path,
			);
		}
	});
});
