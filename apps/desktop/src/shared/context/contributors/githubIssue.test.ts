import { describe, expect, test } from "bun:test";
import type { GitHubIssueContent, ResolveCtx } from "../types";
import { githubIssueContributor } from "./githubIssue";

function makeCtx(
	fetchIssue: (url: string) => Promise<GitHubIssueContent>,
): ResolveCtx {
	return {
		projectId: "p",
		signal: new AbortController().signal,
		fetchIssue,
		fetchPullRequest: async () => {
			throw new Error("unused");
		},
		fetchInternalTask: async () => {
			throw new Error("unused");
		},
		readAgentInstructions: async () => {
			throw new Error("unused");
		},
	};
}

const ISSUE: GitHubIssueContent = {
	number: 123,
	url: "https://github.com/acme/repo/issues/123",
	title: "Auth stores tokens in plaintext",
	body: "Legal flagged this.",
	slug: "auth-stores-tokens-in-plaintext",
};

describe("githubIssueContributor", () => {
	test("metadata", () => {
		expect(githubIssueContributor.kind).toBe("github-issue");
		expect(githubIssueContributor.requiresQuery).toBe(true);
	});

	test("resolves to a user-scoped section with title + body + meta", async () => {
		const section = await githubIssueContributor.resolve(
			{ kind: "github-issue", url: ISSUE.url },
			makeCtx(async () => ISSUE),
		);
		expect(section).toEqual({
			id: `issue:${ISSUE.number}`,
			kind: "github-issue",
			scope: "user",
			label: `Issue #${ISSUE.number} — ${ISSUE.title}`,
			content: [
				{
					type: "text",
					text: `# ${ISSUE.title}\n\n${ISSUE.body}`,
				},
			],
			meta: { url: ISSUE.url, taskSlug: ISSUE.slug },
		});
	});

	test("returns null on fetch 404 (non-fatal)", async () => {
		const section = await githubIssueContributor.resolve(
			{ kind: "github-issue", url: ISSUE.url },
			makeCtx(async () => {
				throw Object.assign(new Error("not found"), { status: 404 });
			}),
		);
		expect(section).toBeNull();
	});

	test("propagates non-404 errors", async () => {
		await expect(
			githubIssueContributor.resolve(
				{ kind: "github-issue", url: ISSUE.url },
				makeCtx(async () => {
					throw new Error("network");
				}),
			),
		).rejects.toThrow("network");
	});

	test("omits body block when empty", async () => {
		const section = await githubIssueContributor.resolve(
			{ kind: "github-issue", url: ISSUE.url },
			makeCtx(async () => ({ ...ISSUE, body: "" })),
		);
		expect(section?.content).toEqual([
			{ type: "text", text: `# ${ISSUE.title}` },
		]);
	});
});
