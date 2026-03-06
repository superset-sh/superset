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
	test("keeps the first three meaningful English keywords", () => {
		expect(
			deriveWorkspaceBranchFromPrompt(
				"Please fix the auth flow for login redirects",
			),
		).toBe("fix-auth-flow");
	});

	test("translates common Spanish dev terms into English", () => {
		expect(
			deriveWorkspaceBranchFromPrompt(
				"Arreglar autenticación de usuario en dashboard",
			),
		).toBe("fix-auth-user");
	});

	test("ensures at least two words", () => {
		expect(deriveWorkspaceBranchFromPrompt("Auth")).toBe("update-auth");
	});

	test("caps generated branch length", () => {
		const longPrompt =
			"Please improve the mobile authentication settings page and repo sync";
		expect(deriveWorkspaceBranchFromPrompt(longPrompt, 16)).toBe(
			"improve-mobile",
		);
	});
});
