import { describe, expect, test } from "bun:test";
import { generateFriendlyBranchName } from "@superset/shared/workspace-launch";
import { resolveAutoBranchName, resolveAutoTitle } from "./auto-name-fallback";

// Reproduction for #5825: creating a workspace from a meaningful prompt used
// to yield a sensible branch/title derived from that prompt. When AI naming is
// unavailable the create flow regressed to random friendly words (e.g.
// "interesting-forest"), discarding the prompt the user already typed.
const PROMPT = "Let's implement some UI changes after QA";

describe("resolveAutoBranchName", () => {
	test("prefers the AI-generated branch name when present", () => {
		expect(resolveAutoBranchName("ui-changes-after-qa", PROMPT)).toBe(
			"ui-changes-after-qa",
		);
	});

	test("derives a sensible slug from the prompt when AI naming is unavailable", () => {
		const branch = resolveAutoBranchName(null, PROMPT);
		// The bug: this returned a random friendly name unrelated to the prompt.
		expect(branch).toBe("lets-implement-some-ui-changes");
		expect(branch).toContain("ui-changes");
	});

	test("falls back to a friendly random name only when there is no prompt", () => {
		const branch = resolveAutoBranchName(null, "   ");
		// Shape of friendly-words output: two lowercase segments joined by "-".
		expect(branch).toMatch(/^[a-z]+-[a-z]+$/);
	});
});

describe("resolveAutoTitle", () => {
	test("prefers the AI-generated title when present", () => {
		expect(resolveAutoTitle("UI changes after QA", PROMPT)).toBe(
			"UI changes after QA",
		);
	});

	test("derives a title from the prompt when AI naming is unavailable", () => {
		expect(resolveAutoTitle(null, PROMPT)).toBe(PROMPT);
	});

	test("returns null when there is no prompt to derive from", () => {
		expect(resolveAutoTitle(null, "   ")).toBeNull();
	});
});

describe("regression guard", () => {
	test("the pre-fix fallback (friendly random) ignores the prompt", () => {
		// Documents the buggy behavior the fix replaces: friendly-words never
		// reflects the prompt, which is exactly what users observed in #5825.
		expect(generateFriendlyBranchName()).not.toContain("ui-changes");
	});
});
