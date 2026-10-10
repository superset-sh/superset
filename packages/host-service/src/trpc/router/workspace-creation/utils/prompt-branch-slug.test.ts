import { describe, expect, test } from "bun:test";
import { promptBranchSlug } from "./prompt-branch-slug";

describe("promptBranchSlug", () => {
	test.each([
		["please fix the login redirect bug", "fix-login-redirect-bug"],
		["https://superset.sh please fix login", "fix-login"],
		[
			"Can you look at #8123 and fix the flaky terminal test?",
			"fix-flaky-terminal-test",
		],
		["Résumé parser crashes", "resume-parser-crashes"],
		["refactor", "refactor"],
		[
			"Investigate why the host-service crashes on startup",
			"investigate-why-host-service",
		],
	])("%s → %s", (prompt, slug) => {
		expect(promptBranchSlug(prompt)).toBe(slug);
	});

	test.each([
		"hi",
		"hey there",
		"https://example.com/a/b",
		"ログインのバグを直して",
		"  ",
	])("%s has nothing to name a folder by", (prompt) => {
		expect(promptBranchSlug(prompt)).toBeNull();
	});
});
