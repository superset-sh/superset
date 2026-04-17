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

	test("resolves to a section with explicit kind + number in header", async () => {
		const section = await githubIssueContributor.resolve(
			{ kind: "github-issue", url: ISSUE.url },
			makeCtx(async () => ISSUE),
		);
		expect(section?.id).toBe(`issue:${ISSUE.number}`);
		expect(section?.label).toBe(`Issue #${ISSUE.number} — ${ISSUE.title}`);
		const text = (section?.content[0] as { type: "text"; text: string }).text;
		expect(text).toContain(`# GitHub Issue #${ISSUE.number} — ${ISSUE.title}`);
		expect(text).toContain(ISSUE.body);
		expect(section?.meta).toEqual({ url: ISSUE.url, taskSlug: ISSUE.slug });
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
		const text = (section?.content[0] as { type: "text"; text: string }).text;
		expect(text).toBe(`# GitHub Issue #${ISSUE.number} — ${ISSUE.title}`);
	});
});
