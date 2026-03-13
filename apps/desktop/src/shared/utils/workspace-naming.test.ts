import { describe, expect, test } from "bun:test";
import {
	deriveWorkspaceBranchFromPrompt,
	deriveWorkspaceTitleFromPrompt,
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

	test("strips filler words from verbose prompts to produce concise branch names", () => {
		const verbose =
			"I want to create an OAuth function with Google and Apple login using Supabase";
		const result = deriveWorkspaceBranchFromPrompt(verbose);
		// Should not start with "i-want-to-create-an-"
		expect(result).not.toMatch(/^i-want-to/);
		// Should contain the key terms
		expect(result).toContain("oauth");
		expect(result).toContain("google");
		// Should be concise (well under 50 chars)
		expect(result.length).toBeLessThanOrEqual(30);
	});

	test("keeps all words when prompt is already concise", () => {
		expect(deriveWorkspaceBranchFromPrompt("fix login bug")).toBe(
			"fix-login-bug",
		);
	});

	test("removes common stop words like 'the', 'a', 'an', 'is', 'for'", () => {
		const result = deriveWorkspaceBranchFromPrompt(
			"Add a feature for the dashboard",
		);
		expect(result).not.toContain("-a-");
		expect(result).not.toContain("-the-");
		expect(result).not.toContain("-for-");
	});

	test("does not strip technical terms that look like stop words", () => {
		// Single meaningful words should remain
		const result = deriveWorkspaceBranchFromPrompt("fix bug");
		expect(result).toBe("fix-bug");
	});

	test("handles prompt that becomes empty after stop word removal", () => {
		const result = deriveWorkspaceBranchFromPrompt("I want to do the");
		// Should fallback gracefully, not be empty
		expect(result.length).toBeGreaterThan(0);
	});
});
