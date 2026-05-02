import { describe, expect, test } from "bun:test";
import type { GitHubPullRequestContent, ResolveCtx } from "../types";
import { githubPrContributor } from "./githubPr";

function makeCtx(
	fetchPullRequest: (url: string) => Promise<GitHubPullRequestContent>,
): ResolveCtx {
	return {
		projectId: "p",
		signal: new AbortController().signal,
		fetchIssue: async () => {
			throw new Error("unused");
		},
		fetchPullRequest,
		fetchInternalTask: async () => {
			throw new Error("unused");
		},
	};
}

const PR: GitHubPullRequestContent = {
	number: 200,
	url: "https://github.com/acme/repo/pull/200",
	title: "Rewrite auth middleware",
	body: "Replaces plaintext token storage.",
	branch: "fix/auth-encryption",
};

describe("githubPrContributor", () => {
	test("metadata", () => {
		expect(githubPrContributor.kind).toBe("github-pr");
		expect(githubPrContributor.requiresQuery).toBe(true);
	});

	test("resolves to a user section with title + body + branch meta", async () => {
		const section = await githubPrContributor.resolve(
			{ kind: "github-pr", url: PR.url },
			makeCtx(async () => PR),
		);
		expect(section?.id).toBe(`pr:${PR.number}`);
		expect(section?.label).toBe(`PR #${PR.number} — ${PR.title}`);
		expect(section?.meta).toEqual({ url: PR.url });
		const text = (section?.content[0] as { type: "text"; text: string }).text;
		expect(text).toContain(`# PR #${PR.number} — ${PR.title}`);
		expect(text).toContain(`This PR is checked out`);
		expect(text).toContain(PR.body);
	});

	test("returns null on 404", async () => {
		const section = await githubPrContributor.resolve(
			{ kind: "github-pr", url: PR.url },
			makeCtx(async () => {
				throw Object.assign(new Error("not found"), { status: 404 });
			}),
		);
		expect(section).toBeNull();
	});

	test("omits body block when empty", async () => {
		const section = await githubPrContributor.resolve(
			{ kind: "github-pr", url: PR.url },
			makeCtx(async () => ({ ...PR, body: "" })),
		);
		const text = (section?.content[0] as { type: "text"; text: string }).text;
		expect(text).toContain(`# PR #${PR.number} — ${PR.title}`);
		expect(text).toContain("checked out");
		expect(text).not.toContain("Replaces"); // body not present
	});
});
