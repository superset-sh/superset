import { describe, expect, test } from "bun:test";
import { buildCreatePrPrompt } from "./create-pr-prompt";
import type { PrContext } from "./pr-context";

const context: PrContext = {
	head: "feat/x",
	base: { name: "main", ref: "origin/main" },
	commits: [{ hash: "a", shortHash: "a1", subject: "feat: x", body: "" }],
	files: [{ path: "x.ts", additions: 1, deletions: 0, generated: false }],
	patch: {
		text: "diff --git a/x.ts b/x.ts\n+x\n",
		includedFiles: 1,
		omittedFiles: 0,
		truncated: false,
	},
	hasUncommitted: false,
	unpushedCommits: 0,
};

describe("buildCreatePrPrompt", () => {
	test("brief, inline skill, then context; names the override paths for the bundled skill", () => {
		const prompt = buildCreatePrPrompt({
			skill: {
				source: "bundled",
				path: "/app/plugin/SKILL.md",
				body: "# Skill\nDo it.",
			},
			context,
			draft: false,
		});
		expect(
			prompt.startsWith("Create a pull request for the current branch"),
		).toBe(true);
		expect(prompt).toContain(".agents/skills/create-pr/SKILL.md");
		expect(prompt).toContain("~/.agents/skills/superset-create-pr/SKILL.md");
		expect(prompt).not.toContain("--draft");
		expect(prompt.indexOf('<skill name="create-pr">')).toBeLessThan(
			prompt.indexOf("<pr-context>"),
		);
		expect(prompt).toContain("# Skill\nDo it.\n</skill>");
		expect(prompt).toContain("Branch: feat/x");
		expect(prompt.endsWith("</pr-context>")).toBe(true);
	});

	test("draft flag and an overriding skill's path", () => {
		const prompt = buildCreatePrPrompt({
			skill: {
				source: "project",
				path: "/repo/.agents/skills/create-pr/SKILL.md",
				body: "custom",
			},
			context,
			draft: true,
		});
		expect(prompt).toContain("Open it as a draft (`gh pr create --draft`).");
		expect(prompt).toContain(
			"These instructions come from /repo/.agents/skills/create-pr/SKILL.md",
		);
	});
});
