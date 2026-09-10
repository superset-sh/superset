import { describe, expect, test } from "bun:test";
import { generateWorkspaceNamesFromPrompt } from "./ai-workspace-names";

describe("generateWorkspaceNamesFromPrompt", () => {
	test("derives names from the prompt when no agent context is supplied", async () => {
		await expect(
			generateWorkspaceNamesFromPrompt("  Fix the login   redirect loop! "),
		).resolves.toEqual({
			title: "Fix the login redirect loop",
			branchName: "fix-the-login-redirect-loop",
		});
	});

	test("returns null for a blank prompt", async () => {
		await expect(generateWorkspaceNamesFromPrompt("   ")).resolves.toBeNull();
	});

	test("caps the derived branch slug at 30 characters", async () => {
		const names = await generateWorkspaceNamesFromPrompt(
			"rewrite the entire authentication and authorization subsystem",
		);
		expect(names?.branchName).toBe("rewrite-the-entire-authenticat");
		expect(names?.branchName.length).toBeLessThanOrEqual(30);
	});

	test("keeps the full title when the branch slug truncates it", async () => {
		const names = await generateWorkspaceNamesFromPrompt(
			"rewrite the entire authentication and authorization subsystem",
		);
		expect(names?.title).toBe(
			"rewrite the entire authentication and authorization subsystem",
		);
	});

	// Naming instructions are a prompt for the agent CLI; the derived
	// fallback has no model to give them to and ignores them.
	test("still derives names when the project sets naming instructions", async () => {
		await expect(
			generateWorkspaceNamesFromPrompt(
				"fix the login redirect",
				undefined,
				"Prefix branches with fix/ and include the ticket id.",
			),
		).resolves.toEqual({
			title: "fix the login redirect",
			branchName: "fix-the-login-redirect",
		});
	});
});
