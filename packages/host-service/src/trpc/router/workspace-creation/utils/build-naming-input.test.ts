import { describe, expect, test } from "bun:test";
import { buildWorkspaceNamingInput } from "./build-naming-input";

describe("buildWorkspaceNamingInput", () => {
	test("returns null when no prompt or linked context provided", () => {
		expect(buildWorkspaceNamingInput({})).toBe(null);
	});

	test("returns null when only empty/whitespace inputs are provided", () => {
		expect(
			buildWorkspaceNamingInput({
				prompt: "   ",
				linkedIssueTitles: [" ", ""],
				linkedPrTitle: "",
			}),
		).toBe(null);
	});

	test("returns the trimmed prompt when no linked context is given", () => {
		const result = buildWorkspaceNamingInput({ prompt: "  add login flow  " });
		expect(result).toContain("add login flow");
		expect(result).not.toContain("Linked issues");
		expect(result).not.toContain("Linked pull request");
	});

	// Regression for issue #3873: when the user links tickets/PRs but doesn't
	// type a prompt, the AI namer used to fall back to the friendly random
	// name because the linked context wasn't being fed in at all.
	test("includes linked issue titles when provided without a prompt", () => {
		const result = buildWorkspaceNamingInput({
			linkedIssueTitles: ["Fix login redirect loop", "Improve error toast"],
		});
		expect(result).not.toBe(null);
		expect(result).toContain("Linked issues");
		expect(result).toContain("Fix login redirect loop");
		expect(result).toContain("Improve error toast");
	});

	test("includes linked PR title when provided", () => {
		const result = buildWorkspaceNamingInput({
			linkedPrTitle: "feat: add dark mode toggle",
		});
		expect(result).not.toBe(null);
		expect(result).toContain("Linked pull request");
		expect(result).toContain("feat: add dark mode toggle");
	});

	// The whole point of the feature: linked context should reach the LLM
	// alongside the prompt so the model can summarize from the most accurate
	// signal (the ticket title) instead of just paraphrasing the prompt.
	test("combines prompt with linked issues and PR title", () => {
		const result = buildWorkspaceNamingInput({
			prompt: "investigate the bug",
			linkedIssueTitles: ["Login redirect loop"],
			linkedPrTitle: "fix: redirect loop on auth",
		});
		expect(result).not.toBe(null);
		expect(result).toContain("Linked issues");
		expect(result).toContain("Login redirect loop");
		expect(result).toContain("Linked pull request");
		expect(result).toContain("fix: redirect loop on auth");
		expect(result).toContain("investigate the bug");
	});

	test("trims whitespace and skips empty entries in linked issue titles", () => {
		const result = buildWorkspaceNamingInput({
			linkedIssueTitles: ["  ", "Real title", ""],
		});
		expect(result).not.toBe(null);
		expect(result).toContain("Real title");
		// Bullet count: only one real entry should appear.
		const bulletCount = (result?.match(/^- /gm) ?? []).length;
		expect(bulletCount).toBe(1);
	});
});
