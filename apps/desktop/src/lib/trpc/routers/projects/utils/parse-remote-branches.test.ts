import { describe, expect, test } from "bun:test";
import { parseRemoteBranchLines } from "./parse-remote-branches";

describe("parseRemoteBranchLines", () => {
	test("returns normal remote branches with dates", () => {
		const raw = ["origin/main 1700000000", "origin/feature-x 1699000000"].join(
			"\n",
		);

		const result = parseRemoteBranchLines(raw);

		expect(result).toEqual([
			{ branch: "main", lastCommitDate: 1700000000 * 1000 },
			{ branch: "feature-x", lastCommitDate: 1699000000 * 1000 },
		]);
	});

	test('skips "origin/HEAD" (explicit HEAD pointer)', () => {
		const raw = ["origin/HEAD 1700000000", "origin/main 1700000000"].join("\n");

		const result = parseRemoteBranchLines(raw);

		const names = result.map((r) => r.branch);
		expect(names).not.toContain("HEAD");
		expect(names).toContain("main");
	});

	/**
	 * Regression test for issue #2170:
	 * git for-each-ref --format=%(refname:short) refs/remotes/origin/ emits the
	 * bare string "origin" for refs/remotes/origin/HEAD when git collapses the
	 * symbolic ref. The old code only skipped "HEAD" (after stripping "origin/"),
	 * so "origin" slipped through and appeared as a selectable branch.
	 */
	test('skips bare "origin" entry (symbolic remote HEAD collapsed by git)', () => {
		const raw = [
			"origin 0", // git emits this for refs/remotes/origin/HEAD
			"origin/main 1700000000",
			"origin/feature-branch 1699000000",
		].join("\n");

		const result = parseRemoteBranchLines(raw);

		const names = result.map((r) => r.branch);
		expect(names).not.toContain("origin");
		expect(names).toContain("main");
		expect(names).toContain("feature-branch");
	});

	test("handles empty output gracefully", () => {
		expect(parseRemoteBranchLines("")).toEqual([]);
		expect(parseRemoteBranchLines("   ")).toEqual([]);
	});

	test("handles output with only the bare origin entry", () => {
		const raw = "origin 0";
		const result = parseRemoteBranchLines(raw);
		expect(result).toEqual([]);
	});
});
