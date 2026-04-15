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
		expect(section).toEqual({
			id: `pr:${PR.number}`,
			kind: "github-pr",
			scope: "user",
			label: `PR #${PR.number} — ${PR.title}`,
			content: [
				{
					type: "text",
					text: `# ${PR.title}\n\nBranch: \`${PR.branch}\`\n\n${PR.body}`,
				},
			],
			meta: { url: PR.url },
		});
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
		expect(section?.content).toEqual([
			{ type: "text", text: `# ${PR.title}\n\nBranch: \`${PR.branch}\`` },
		]);
	});
});
