import { describe, expect, it } from "bun:test";
import type { Octokit } from "@octokit/rest";
import type { SearchRepoRef } from "../types";
import { searchIssuesGitHub, searchPullRequestsGitHub } from "./github-search";

const repo: SearchRepoRef = {
	owner: "acme",
	name: "widget",
	repoPath: "/tmp/widget",
};

/** Minimal Octokit stub — only the methods the search functions call. */
function fakeOctokit(overrides?: {
	pullsGet?: () => Promise<{ data: unknown }>;
	issuesGet?: () => Promise<{ data: unknown }>;
	searchIssuesAndPullRequests?: () => Promise<{ data: unknown }>;
}): Octokit {
	return {
		pulls: {
			get:
				overrides?.pullsGet ??
				(async () => ({
					data: {
						number: 42,
						title: "Fix everything",
						html_url: "https://github.com/acme/widget/pull/42",
						state: "open",
						draft: false,
						merged_at: null,
						user: { login: "alice" },
					},
				})),
		},
		issues: {
			get:
				overrides?.issuesGet ??
				(async () => ({
					data: {
						number: 7,
						title: "Bug in widget",
						html_url: "https://github.com/acme/widget/issues/7",
						state: "open",
						user: { login: "bob" },
						pull_request: undefined,
					},
				})),
		},
		search: {
			issuesAndPullRequests:
				overrides?.searchIssuesAndPullRequests ??
				(async () => ({
					data: { total_count: 0, items: [] },
				})),
		},
	} as unknown as Octokit;
}

// ─── searchPullRequestsGitHub ────────────────────────────────────────────────

describe("searchPullRequestsGitHub", () => {
	it("returns repoMismatch with no network call when text is a different-repo GitHub URL", async () => {
		let execGhCalls = 0;
		let githubCalls = 0;
		const result = await searchPullRequestsGitHub(
			{
				execGh: async () => {
					execGhCalls++;
					return {};
				},
				github: async () => {
					githubCalls++;
					return fakeOctokit();
				},
			},
			repo,
			{ text: "https://github.com/other/repo/pull/5" },
		);
		expect(result.repoMismatch).toBe("acme/widget");
		expect(result.pullRequests).toEqual([]);
		expect(result.totalCount).toBe(0);
		expect(execGhCalls).toBe(0);
		expect(githubCalls).toBe(0);
	});

	it("direct-lookup via gh when text is a bare number", async () => {
		const execGhResponse = {
			number: 42,
			title: "Fix everything",
			url: "https://github.com/acme/widget/pull/42",
			state: "open",
			isDraft: false,
			author: { login: "alice" },
			mergedAt: null,
		};
		let execGhCalls = 0;
		let githubCalls = 0;
		const result = await searchPullRequestsGitHub(
			{
				execGh: async () => {
					execGhCalls++;
					return execGhResponse;
				},
				github: async () => {
					githubCalls++;
					return fakeOctokit();
				},
			},
			repo,
			{ text: "42" },
		);
		expect(result.pullRequests).toHaveLength(1);
		expect(result.pullRequests[0]?.prNumber).toBe(42);
		expect(result.pullRequests[0]?.title).toBe("Fix everything");
		expect(result.pullRequests[0]?.state).toBe("open");
		expect(execGhCalls).toBe(1);
		expect(githubCalls).toBe(0);
	});

	it("falls back to Octokit when gh throws during text search", async () => {
		let githubCalls = 0;
		const result = await searchPullRequestsGitHub(
			{
				execGh: async () => {
					throw new Error("gh not authed");
				},
				github: async () => {
					githubCalls++;
					return fakeOctokit({
						searchIssuesAndPullRequests: async () => ({
							data: {
								total_count: 1,
								items: [
									{
										number: 99,
										title: "Fallback PR",
										html_url: "https://github.com/acme/widget/pull/99",
										state: "open",
										draft: false,
										user: { login: "charlie" },
										pull_request: { merged_at: null },
									},
								],
							},
						}),
					});
				},
			},
			repo,
			{ text: "fix" },
		);
		expect(githubCalls).toBe(1);
		expect(result.pullRequests).toHaveLength(1);
		expect(result.pullRequests[0]?.prNumber).toBe(99);
	});

	it("falls back to Octokit direct-lookup when gh throws on bare-number text", async () => {
		let githubCalls = 0;
		const result = await searchPullRequestsGitHub(
			{
				execGh: async () => {
					throw new Error("gh not authed");
				},
				github: async () => {
					githubCalls++;
					return fakeOctokit();
				},
			},
			repo,
			{ text: "42" },
		);
		expect(githubCalls).toBe(1);
		expect(result.pullRequests).toHaveLength(1);
		expect(result.pullRequests[0]?.prNumber).toBe(42);
	});

	it("rethrows when both gh and Octokit fail", async () => {
		await expect(
			searchPullRequestsGitHub(
				{
					execGh: async () => {
						throw new Error("gh not authed");
					},
					github: async () => {
						throw new Error("token expired");
					},
				},
				repo,
				{ text: "fix" },
			),
		).rejects.toThrow("token expired");
	});

	it("filters out non-PR items from gh search results", async () => {
		// gh search returns both issues and PRs; we keep only those with pull_request
		const execGhResponse = {
			total_count: 2,
			items: [
				{
					number: 10,
					title: "A PR",
					html_url: "https://github.com/acme/widget/pull/10",
					state: "open",
					draft: false,
					user: { login: "dev" },
					pull_request: { merged_at: null },
				},
				{
					number: 11,
					title: "An Issue",
					html_url: "https://github.com/acme/widget/issues/11",
					state: "open",
					user: { login: "dev" },
					// no pull_request field
				},
			],
		};
		const result = await searchPullRequestsGitHub(
			{
				execGh: async () => execGhResponse,
				github: async () => fakeOctokit(),
			},
			repo,
			{ text: "fix" },
		);
		expect(result.pullRequests).toHaveLength(1);
		expect(result.pullRequests[0]?.prNumber).toBe(10);
	});

	it("normalizes merged state from mergedAt on gh direct-lookup", async () => {
		const result = await searchPullRequestsGitHub(
			{
				execGh: async () => ({
					number: 5,
					title: "Merged",
					url: "https://github.com/acme/widget/pull/5",
					state: "closed",
					isDraft: false,
					author: { login: "dev" },
					mergedAt: "2024-01-01T00:00:00Z",
				}),
				github: async () => fakeOctokit(),
			},
			repo,
			{ text: "5" },
		);
		expect(result.pullRequests[0]?.state).toBe("merged");
	});

	it("computes hasNextPage=true when total_count exceeds the page window", async () => {
		const result = await searchPullRequestsGitHub(
			{
				execGh: async () => ({ total_count: 50, items: [] }),
				github: async () => fakeOctokit(),
			},
			repo,
			{ text: "fix", page: 1, limit: 30 },
		);
		expect(result.totalCount).toBe(50);
		expect(result.hasNextPage).toBe(true); // 1 * 30 < 50
	});

	it("computes hasNextPage=false on the last page", async () => {
		const result = await searchPullRequestsGitHub(
			{
				execGh: async () => ({ total_count: 20, items: [] }),
				github: async () => fakeOctokit(),
			},
			repo,
			{ text: "fix", page: 1, limit: 30 },
		);
		expect(result.hasNextPage).toBe(false); // 1 * 30 < 20 is false
	});

	it("includes is:open in the gh query when includeClosed is false", async () => {
		let capturedQuery = "";
		await searchPullRequestsGitHub(
			{
				execGh: async (args) => {
					capturedQuery = args.find((a) => a.startsWith("q=")) ?? "";
					return { total_count: 0, items: [] };
				},
				github: async () => fakeOctokit(),
			},
			repo,
			{ text: "fix", includeClosed: false },
		);
		expect(capturedQuery).toContain("is:pr");
		expect(capturedQuery).toContain("is:open");
	});

	it("omits is:open from the gh query when includeClosed is true", async () => {
		let capturedQuery = "";
		await searchPullRequestsGitHub(
			{
				execGh: async (args) => {
					capturedQuery = args.find((a) => a.startsWith("q=")) ?? "";
					return { total_count: 0, items: [] };
				},
				github: async () => fakeOctokit(),
			},
			repo,
			{ text: "fix", includeClosed: true },
		);
		expect(capturedQuery).toContain("is:pr");
		expect(capturedQuery).not.toContain("is:open");
	});
});

// ─── searchIssuesGitHub ──────────────────────────────────────────────────────

describe("searchIssuesGitHub", () => {
	it("returns repoMismatch with no network call when text is a different-repo GitHub URL", async () => {
		let execGhCalls = 0;
		let githubCalls = 0;
		const result = await searchIssuesGitHub(
			{
				execGh: async () => {
					execGhCalls++;
					return {};
				},
				github: async () => {
					githubCalls++;
					return fakeOctokit();
				},
			},
			repo,
			{ text: "https://github.com/other/repo/issues/3" },
		);
		expect(result.repoMismatch).toBe("acme/widget");
		expect(result.issues).toEqual([]);
		expect(execGhCalls).toBe(0);
		expect(githubCalls).toBe(0);
	});

	it("direct-lookup via gh when text is a bare number", async () => {
		const execGhResponse = {
			number: 7,
			title: "Bug in widget",
			url: "https://github.com/acme/widget/issues/7",
			state: "open",
			author: { login: "bob" },
		};
		let execGhCalls = 0;
		let githubCalls = 0;
		const result = await searchIssuesGitHub(
			{
				execGh: async () => {
					execGhCalls++;
					return execGhResponse;
				},
				github: async () => {
					githubCalls++;
					return fakeOctokit();
				},
			},
			repo,
			{ text: "7" },
		);
		expect(result.issues).toHaveLength(1);
		expect(result.issues[0]?.issueNumber).toBe(7);
		expect(result.issues[0]?.title).toBe("Bug in widget");
		expect(execGhCalls).toBe(1);
		expect(githubCalls).toBe(0);
	});

	it("returns empty issues page when gh direct-lookup returns a /pull/ URL", async () => {
		// gh issue view can return PRs — detect via URL
		const execGhResponse = {
			number: 42,
			title: "This is actually a PR",
			url: "https://github.com/acme/widget/pull/42",
			state: "open",
			author: { login: "alice" },
		};
		const result = await searchIssuesGitHub(
			{
				execGh: async () => execGhResponse,
				github: async () => fakeOctokit(),
			},
			repo,
			{ text: "42" },
		);
		expect(result.issues).toEqual([]);
		expect(result.totalCount).toBe(0);
	});

	it("falls back to Octokit when gh throws during text search", async () => {
		let githubCalls = 0;
		const result = await searchIssuesGitHub(
			{
				execGh: async () => {
					throw new Error("gh not authed");
				},
				github: async () => {
					githubCalls++;
					return fakeOctokit({
						searchIssuesAndPullRequests: async () => ({
							data: {
								total_count: 1,
								items: [
									{
										number: 55,
										title: "A real issue",
										html_url: "https://github.com/acme/widget/issues/55",
										state: "open",
										user: { login: "dev" },
										pull_request: undefined,
									},
								],
							},
						}),
					});
				},
			},
			repo,
			{ text: "bug" },
		);
		expect(githubCalls).toBe(1);
		expect(result.issues).toHaveLength(1);
		expect(result.issues[0]?.issueNumber).toBe(55);
	});

	it("Octokit direct-lookup filters out items with pull_request field", async () => {
		const result = await searchIssuesGitHub(
			{
				execGh: async () => {
					throw new Error("gh not authed");
				},
				github: async () =>
					fakeOctokit({
						issuesGet: async () => ({
							data: {
								number: 42,
								title: "Actually a PR",
								html_url: "https://github.com/acme/widget/pull/42",
								state: "open",
								user: { login: "alice" },
								pull_request: { merged_at: null },
							},
						}),
					}),
			},
			repo,
			{ text: "42" },
		);
		expect(result.issues).toEqual([]);
		expect(result.totalCount).toBe(0);
	});

	it("filters out PR items from gh text search results", async () => {
		const execGhResponse = {
			total_count: 2,
			items: [
				{
					number: 20,
					title: "A real issue",
					html_url: "https://github.com/acme/widget/issues/20",
					state: "open",
					user: { login: "dev" },
					// no pull_request
				},
				{
					number: 21,
					title: "A PR mixed in",
					html_url: "https://github.com/acme/widget/pull/21",
					state: "open",
					user: { login: "dev" },
					pull_request: { merged_at: null },
				},
			],
		};
		const result = await searchIssuesGitHub(
			{
				execGh: async () => execGhResponse,
				github: async () => fakeOctokit(),
			},
			repo,
			{ text: "bug" },
		);
		expect(result.issues).toHaveLength(1);
		expect(result.issues[0]?.issueNumber).toBe(20);
	});

	it("rethrows when both gh and Octokit fail", async () => {
		await expect(
			searchIssuesGitHub(
				{
					execGh: async () => {
						throw new Error("gh not authed");
					},
					github: async () => {
						throw new Error("token expired");
					},
				},
				repo,
				{ text: "bug" },
			),
		).rejects.toThrow("token expired");
	});
});
