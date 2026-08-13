import { describe, expect, test } from "bun:test";
import { getAvailableMergeMethods } from "./githubMergeMethods";

describe("getAvailableMergeMethods", () => {
	test("returns the only method allowed by the repository", () => {
		expect(
			getAvailableMergeMethods({
				allowMergeCommit: true,
				allowRebaseMerge: false,
				allowSquashMerge: false,
				viewerDefaultMergeMethod: "MERGE",
			}),
		).toEqual(["merge"]);
	});

	test("puts the repository default first when it is available", () => {
		expect(
			getAvailableMergeMethods({
				allowMergeCommit: true,
				allowRebaseMerge: true,
				allowSquashMerge: true,
				viewerDefaultMergeMethod: "REBASE",
			}),
		).toEqual(["rebase", "squash", "merge"]);
	});

	test("keeps the fallback menu when settings are unavailable", () => {
		expect(getAvailableMergeMethods(null)).toEqual([
			"squash",
			"merge",
			"rebase",
		]);
	});

	test("never returns disabled methods for the merge menu", () => {
		const methods = getAvailableMergeMethods({
			allowMergeCommit: true,
			allowRebaseMerge: true,
			allowSquashMerge: false,
			viewerDefaultMergeMethod: "SQUASH",
		});

		expect(methods).toEqual(["merge", "rebase"]);
		expect(methods).not.toContain("squash");
	});
});
