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
});
