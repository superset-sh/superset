import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { createTestHost, type TestHost } from "../helpers/createTestHost";

describe("workspaceCreation github procedures with mocked Octokit", () => {
	let host: TestHost;
	const calls: Array<{ method: string; args: unknown }> = [];

	const fakeOctokit = {
		issues: {
			get: async (args: unknown) => {
				calls.push({ method: "issues.get", args });
				const a = args as { issue_number: number };
				return {
					data: {
						number: a.issue_number,
						title: `Issue #${a.issue_number}`,
						html_url: `https://github.com/octocat/hello/issues/${a.issue_number}`,
						state: "open",
						user: { login: "alice" },
						pull_request: undefined,
					},
				};
			},
		},
		pulls: {
			get: async (args: unknown) => {
				calls.push({ method: "pulls.get", args });
				const a = args as { pull_number: number };
				return {
					data: {
						number: a.pull_number,
						title: `PR #${a.pull_number}`,
						html_url: `https://github.com/octocat/hello/pull/${a.pull_number}`,
						state: "open",
						user: { login: "bob" },
						head: { ref: "feature/x" },
						base: { ref: "main" },
						draft: false,
					},
				};
			},
		},
		search: {
			issuesAndPullRequests: async (args: unknown) => {
				calls.push({ method: "search.issuesAndPullRequests", args });
				return {
					data: {
						items: [
							{
								number: 7,
								title: "search hit",
								html_url: "https://github.com/octocat/hello/issues/7",
								state: "open",
								user: { login: "carol" },
								pull_request: undefined,
							},
						],
					},
				};
			},
		},
	};

	const projectId = randomUUID();

	beforeEach(async () => {
		calls.length = 0;
		host = await createTestHost({
			githubFactory: async () => fakeOctokit,
			apiOverrides: {
				"v2Project.get.query": () => ({
					id: projectId,
					githubRepository: { owner: "octocat", name: "hello" },
					repoCloneUrl: "https://github.com/octocat/hello.git",
				}),
			},
		});
	});

	afterEach(async () => {
		await host.dispose();
	});

	test("searchGitHubIssues handles direct #123 lookup via issues.get", async () => {
		const result = await host.trpc.workspaceCreation.searchGitHubIssues.query({
			projectId,
			query: "#42",
		});
		expect(result.issues).toHaveLength(1);
		expect(result.issues[0].issueNumber).toBe(42);
		expect(calls[0].method).toBe("issues.get");
		expect(calls[0].args).toMatchObject({
			owner: "octocat",
			repo: "hello",
			issue_number: 42,
		});
	});

	test("searchGitHubIssues falls through to search.issuesAndPullRequests for free-text", async () => {
		const result = await host.trpc.workspaceCreation.searchGitHubIssues.query({
			projectId,
			query: "fix bug",
		});
		expect(result.issues).toHaveLength(1);
		expect(result.issues[0].issueNumber).toBe(7);
		expect(calls[0].method).toBe("search.issuesAndPullRequests");
	});

	test("searchGitHubIssues returns repoMismatch for cross-repo URLs", async () => {
		const result = await host.trpc.workspaceCreation.searchGitHubIssues.query({
			projectId,
			query: "https://github.com/other/repo/issues/1",
		});
		expect(result.issues).toEqual([]);
		expect(result.repoMismatch).toBe("octocat/hello");
		expect(calls).toHaveLength(0);
	});

	test("searchPullRequests handles direct #123 lookup via pulls.get", async () => {
		const result = await host.trpc.workspaceCreation.searchPullRequests.query({
			projectId,
			query: "#33",
		});
		expect(result.pullRequests).toHaveLength(1);
		expect(result.pullRequests[0].prNumber).toBe(33);
		expect(calls[0].method).toBe("pulls.get");
		expect(calls[0].args).toMatchObject({
			owner: "octocat",
			repo: "hello",
			pull_number: 33,
		});
	});

	test("searchPullRequests filters search results to PRs only", async () => {
		const result = await host.trpc.workspaceCreation.searchPullRequests.query({
			projectId,
			query: "find me",
		});
		// Our fake search returns one issue (no `pull_request`), so no PRs.
		expect(result.pullRequests).toEqual([]);
		expect(calls[0].method).toBe("search.issuesAndPullRequests");
	});
});

describe("project has repoCloneUrl but no linked githubRepository (cloud-dep regression)", () => {
	let host: TestHost;
	const projectId = randomUUID();

	const fakeOctokit = {
		pulls: {
			get: async () => ({
				data: {
					number: 33,
					title: "PR #33",
					html_url: "https://github.com/octocat/hello/pull/33",
					state: "open",
					user: { login: "bob" },
					draft: false,
					merged_at: null,
				},
			}),
		},
		issues: {
			get: async () => ({
				data: {
					number: 42,
					title: "Issue #42",
					html_url: "https://github.com/octocat/hello/issues/42",
					state: "open",
					user: { login: "alice" },
					pull_request: undefined,
				},
			}),
		},
		search: {
			issuesAndPullRequests: async () => ({ data: { items: [] } }),
		},
	};

	beforeEach(async () => {
		// Cloud project has repoCloneUrl but githubRepositoryId is NULL —
		// matches the prod failure mode that prompted this fix. Resolver must
		// parse repoCloneUrl rather than depending on the github_repositories
		// join.
		host = await createTestHost({
			githubFactory: async () => fakeOctokit,
			apiOverrides: {
				"v2Project.get.query": () => ({
					id: projectId,
					githubRepository: null,
					repoCloneUrl: "https://github.com/octocat/hello.git",
				}),
			},
		});
	});

	afterEach(async () => {
		await host.dispose();
	});

	test("searchPullRequests resolves owner/name from repoCloneUrl and returns a result", async () => {
		const result = await host.trpc.workspaceCreation.searchPullRequests.query({
			projectId,
			query: "#33",
		});
		expect(result.pullRequests).toHaveLength(1);
		expect(result.pullRequests[0].prNumber).toBe(33);
	});

	test("searchGitHubIssues resolves owner/name from repoCloneUrl without throwing", async () => {
		const result = await host.trpc.workspaceCreation.searchGitHubIssues.query({
			projectId,
			query: "anything",
		});
		expect(result.issues).toEqual([]);
	});
});

describe("gh CLI is first-class when execGh succeeds", () => {
	let host: TestHost;
	const projectId = randomUUID();
	const ghCalls: Array<{ args: string[]; cwd?: string }> = [];

	const fakeOctokit = {
		// Octokit must NOT be hit when gh succeeds. Throwing here makes any
		// accidental fallback fail the test loudly.
		pulls: {
			get: async () => {
				throw new Error("octokit must not be called when gh succeeds");
			},
		},
		issues: {
			get: async () => {
				throw new Error("octokit must not be called when gh succeeds");
			},
		},
		search: {
			issuesAndPullRequests: async () => {
				throw new Error("octokit must not be called when gh succeeds");
			},
		},
	};

	const fakeExecGh = async (
		args: string[],
		options?: { cwd?: string },
	): Promise<unknown> => {
		ghCalls.push({ args, cwd: options?.cwd });
		// `pr view <n>` returns a single object, `pr list` returns an array;
		// match against the verb to pick the right shape.
		const verb = args[1];
		if (verb === "view" && args[0] === "pr") {
			return {
				number: Number(args[2]),
				title: "PR via gh",
				url: `https://github.com/octocat/hello/pull/${args[2]}`,
				state: "OPEN",
				isDraft: false,
				author: { login: "bob" },
				mergedAt: null,
			};
		}
		if (verb === "list" && args[0] === "pr") {
			return [
				{
					number: 101,
					title: "search result",
					url: "https://github.com/octocat/hello/pull/101",
					state: "OPEN",
					isDraft: false,
					author: { login: "carol" },
					mergedAt: null,
				},
			];
		}
		if (verb === "list" && args[0] === "issue") {
			return [
				{
					number: 7,
					title: "issue search result",
					url: "https://github.com/octocat/hello/issues/7",
					state: "OPEN",
					author: { login: "dave" },
				},
			];
		}
		return {};
	};

	beforeEach(async () => {
		ghCalls.length = 0;
		host = await createTestHost({
			githubFactory: async () => fakeOctokit,
			execGh: fakeExecGh,
			apiOverrides: {
				"v2Project.get.query": () => ({
					id: projectId,
					githubRepository: null,
					repoCloneUrl: "https://github.com/octocat/hello.git",
				}),
			},
		});
	});

	afterEach(async () => {
		await host.dispose();
	});

	test("searchPullRequests #N invokes `gh pr view` against the resolved repo", async () => {
		const result = await host.trpc.workspaceCreation.searchPullRequests.query({
			projectId,
			query: "#33",
		});
		expect(result.pullRequests).toHaveLength(1);
		expect(result.pullRequests[0].prNumber).toBe(33);
		expect(result.pullRequests[0].title).toBe("PR via gh");
		expect(ghCalls).toHaveLength(1);
		expect(ghCalls[0].args.slice(0, 5)).toEqual([
			"pr",
			"view",
			"33",
			"--repo",
			"octocat/hello",
		]);
	});

	test("searchPullRequests free-text invokes `gh pr list --search`", async () => {
		const result = await host.trpc.workspaceCreation.searchPullRequests.query({
			projectId,
			query: "find me",
		});
		expect(result.pullRequests).toHaveLength(1);
		expect(result.pullRequests[0].prNumber).toBe(101);
		expect(ghCalls).toHaveLength(1);
		const args = ghCalls[0].args;
		expect(args[0]).toBe("pr");
		expect(args[1]).toBe("list");
		expect(args).toContain("--repo");
		expect(args).toContain("octocat/hello");
		expect(args).toContain("--search");
		expect(args).toContain("find me");
	});

	test("searchGitHubIssues free-text invokes `gh issue list --search`", async () => {
		const result = await host.trpc.workspaceCreation.searchGitHubIssues.query({
			projectId,
			query: "bug",
		});
		expect(result.issues).toHaveLength(1);
		expect(result.issues[0].issueNumber).toBe(7);
		expect(ghCalls).toHaveLength(1);
		expect(ghCalls[0].args[0]).toBe("issue");
		expect(ghCalls[0].args[1]).toBe("list");
	});
});
