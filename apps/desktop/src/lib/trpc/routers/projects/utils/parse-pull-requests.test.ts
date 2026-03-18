import { describe, expect, test } from "bun:test";
import { parseGhPrListOutput } from "./parse-pull-requests";

describe("parseGhPrListOutput", () => {
	test("parses standard gh pr list output with open PRs", () => {
		const stdout = JSON.stringify([
			{
				number: 42,
				title: "Add feature",
				url: "https://github.com/org/repo/pull/42",
				state: "OPEN",
				isDraft: false,
			},
			{
				number: 43,
				title: "Fix bug",
				url: "https://github.com/org/repo/pull/43",
				state: "OPEN",
				isDraft: false,
			},
		]);

		const result = parseGhPrListOutput(stdout);
		expect(result).toEqual([
			{
				prNumber: 42,
				title: "Add feature",
				url: "https://github.com/org/repo/pull/42",
				state: "open",
			},
			{
				prNumber: 43,
				title: "Fix bug",
				url: "https://github.com/org/repo/pull/43",
				state: "open",
			},
		]);
	});

	test("maps draft PRs to 'draft' state", () => {
		const stdout = JSON.stringify([
			{
				number: 10,
				title: "WIP feature",
				url: "https://github.com/org/repo/pull/10",
				state: "OPEN",
				isDraft: true,
			},
		]);

		const result = parseGhPrListOutput(stdout);
		expect(result).toEqual([
			{
				prNumber: 10,
				title: "WIP feature",
				url: "https://github.com/org/repo/pull/10",
				state: "draft",
			},
		]);
	});

	test("lowercases non-OPEN states", () => {
		const stdout = JSON.stringify([
			{
				number: 1,
				title: "Closed PR",
				url: "https://github.com/org/repo/pull/1",
				state: "CLOSED",
				isDraft: false,
			},
			{
				number: 2,
				title: "Merged PR",
				url: "https://github.com/org/repo/pull/2",
				state: "MERGED",
				isDraft: false,
			},
		]);

		const result = parseGhPrListOutput(stdout);
		expect(result[0]?.state).toBe("closed");
		expect(result[1]?.state).toBe("merged");
	});

	test("returns empty array for empty JSON output", () => {
		expect(parseGhPrListOutput("[]")).toEqual([]);
		expect(parseGhPrListOutput("")).toEqual([]);
		expect(parseGhPrListOutput("  ")).toEqual([]);
	});

	test("returns empty array for non-array JSON", () => {
		expect(parseGhPrListOutput('{"error": "not found"}')).toEqual([]);
	});

	test("filters out items missing required fields", () => {
		const stdout = JSON.stringify([
			{
				number: 1,
				title: "Good PR",
				url: "https://github.com/org/repo/pull/1",
				state: "OPEN",
				isDraft: false,
			},
			// missing state field
			{
				number: 2,
				title: "Bad PR - no state",
				url: "https://github.com/org/repo/pull/2",
				isDraft: false,
			},
			// missing url field
			{
				number: 3,
				title: "Bad PR - no url",
				state: "OPEN",
				isDraft: false,
			},
		]);

		const result = parseGhPrListOutput(stdout);
		// Only the first PR passes - the one missing state is filtered out
		expect(result).toHaveLength(1);
		expect(result[0]?.prNumber).toBe(1);
	});

	/**
	 * Reproduction case for #2519: Items missing the `state` field pass the
	 * original type guard (which only checked number/title/url). When the
	 * mapper then calls `pr.state.toLowerCase()` on `undefined`, it throws a
	 * TypeError that the outer `catch` silently swallows, returning `[]` to
	 * the caller. This makes it look like there are no pull requests.
	 *
	 * The fix adds `"state" in item` to the type guard so these items are
	 * filtered instead of crashing the entire result set.
	 */
	test("does not crash when state is missing (issue #2519 reproduction)", () => {
		const stdout = JSON.stringify([
			{
				number: 1,
				title: "PR without state",
				url: "https://github.com/org/repo/pull/1",
				isDraft: false,
			},
		]);

		// Before the fix, parseGhPrListOutput would throw:
		// TypeError: Cannot read properties of undefined (reading 'toLowerCase')
		// The outer catch in the tRPC procedure would swallow this and return []
		expect(() => parseGhPrListOutput(stdout)).not.toThrow();
		expect(parseGhPrListOutput(stdout)).toEqual([]);
	});

	test("handles isDraft being undefined gracefully", () => {
		const stdout = JSON.stringify([
			{
				number: 1,
				title: "PR without isDraft",
				url: "https://github.com/org/repo/pull/1",
				state: "OPEN",
				// isDraft intentionally omitted
			},
		]);

		const result = parseGhPrListOutput(stdout);
		expect(result).toEqual([
			{
				prNumber: 1,
				title: "PR without isDraft",
				url: "https://github.com/org/repo/pull/1",
				state: "open",
			},
		]);
	});
});
