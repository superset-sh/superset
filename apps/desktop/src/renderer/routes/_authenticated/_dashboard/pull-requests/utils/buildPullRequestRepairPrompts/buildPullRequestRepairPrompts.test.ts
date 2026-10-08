import { describe, expect, it } from "bun:test";
import {
	buildFixFindingsPrompt,
	buildResolveConflictsPrompt,
} from "./buildPullRequestRepairPrompts";

const detail = {
	number: 42,
	title: "Fix the `thing`",
	url: "https://github.com/o/r/pull/42",
	head: { ref: "feat/x", repoFullName: "o/r" },
	base: { ref: "main" },
	checks: [
		{ name: "Typecheck", status: "failure" as const, url: "https://ci/1" },
		{ name: "Lint", status: "success" as const, url: null },
	],
	comments: [
		{
			id: "c1",
			kind: "comment" as const,
			author: { login: "someone", name: null },
			body: "nice",
			createdAt: "2026-10-01T10:00:00Z",
			reviewState: null,
		},
		{
			id: "r1",
			kind: "review" as const,
			author: { login: "bot", name: null },
			body: "## Missing null check\n\nLine 10 dereferences `x`.",
			createdAt: "2026-10-02T10:00:00Z",
			reviewState: "CHANGES_REQUESTED",
			url: null,
		},
	],
};

describe("buildFixFindingsPrompt", () => {
	it("quotes reviews and failing checks, not plain comments or passing checks", () => {
		const prompt = buildFixFindingsPrompt(detail);
		expect(prompt).toContain("PR #42 — Fix the 'thing'");
		expect(prompt).toContain(
			"1. Review by bot:\n> ## Missing null check\n> \n> Line 10",
		);
		expect(prompt).toContain("2. Failing check at https://ci/1:\n> Typecheck");
		expect(prompt).not.toContain("nice");
		expect(prompt).not.toContain("Lint");
	});

	it("skips approvals and keeps findings posted as comments", () => {
		const prompt = buildFixFindingsPrompt({
			...detail,
			checks: [],
			comments: [
				{
					id: "a1",
					kind: "review" as const,
					author: { login: "lead", name: null },
					body: "LGTM",
					createdAt: "2026-10-03T10:00:00Z",
					reviewState: "APPROVED",
				},
				{
					id: "c2",
					kind: "comment" as const,
					author: { login: "bot", name: null },
					body: "### Unused import\n\nLow severity\n\nDrop it.",
					createdAt: "2026-10-04T10:00:00Z",
					reviewState: null,
				},
			],
		});
		expect(prompt).toContain("1. Comment by bot:\n> ### Unused import");
		expect(prompt).not.toContain("LGTM");
	});

	it("says so when there is nothing to quote", () => {
		expect(
			buildFixFindingsPrompt({ ...detail, checks: [], comments: [] }),
		).toContain("No explicit review findings were returned");
	});
});

describe("buildResolveConflictsPrompt", () => {
	it("names the base and head branches", () => {
		const prompt = buildResolveConflictsPrompt(detail);
		expect(prompt).toContain("conflicts with its base branch `main`");
		expect(prompt).toContain("`feat/x`");
	});
});
