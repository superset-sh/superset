import { describe, expect, test } from "bun:test";
import {
	deriveWorkspaceBranchFromPrompt,
	deriveWorkspaceTitleFromPrompt,
	resolveBranchSlug,
} from "./workspace-naming";

describe("deriveWorkspaceTitleFromPrompt", () => {
	test("collapses whitespace and trims", () => {
		expect(deriveWorkspaceTitleFromPrompt("  fix\n   auth flow  ")).toBe(
			"fix auth flow",
		);
	});

	test("respects max length", () => {
		const longPrompt = "a".repeat(140);
		expect(deriveWorkspaceTitleFromPrompt(longPrompt).length).toBe(100);
	});
});

describe("deriveWorkspaceBranchFromPrompt", () => {
	test("sanitizes prompt into branch-safe slug", () => {
		expect(deriveWorkspaceBranchFromPrompt("Fix auth: add SSO + docs!")).toBe(
			"fix-auth-add-sso-+-docs",
		);
	});

	test("caps generated branch length", () => {
		const longPrompt = "very long prompt ".repeat(20);
		expect(
			deriveWorkspaceBranchFromPrompt(longPrompt).length,
		).toBeLessThanOrEqual(100);
	});
});

describe("resolveBranchSlug", () => {
	test("derives branch from title when branch name not manually edited", () => {
		// Regression: before the fix, this returned "" when branchNameEdited=false,
		// causing the backend to fall back to a random friendly-word branch name
		// unrelated to the user's prompt.
		expect(resolveBranchSlug("Fix auth flow", "", false)).toBe("fix-auth-flow");
	});

	test("derives branch from title with special characters when not edited", () => {
		expect(resolveBranchSlug("Add SSO support + docs!", "", false)).toBe(
			"add-sso-support-+-docs",
		);
	});

	test("uses sanitized manually-edited branch name when branchNameEdited is true", () => {
		expect(resolveBranchSlug("Fix auth flow", "my-custom-branch", true)).toBe(
			"my-custom-branch",
		);
	});

	test("returns empty string when title is empty and branch not edited", () => {
		expect(resolveBranchSlug("", "", false)).toBe("");
	});

	test("sanitizes manually-edited branch name", () => {
		expect(resolveBranchSlug("Fix auth flow", "My Branch Name!", true)).toBe(
			"my-branch-name",
		);
	});
});
