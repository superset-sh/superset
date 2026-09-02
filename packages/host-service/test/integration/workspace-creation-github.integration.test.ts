import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import simpleGit from "simple-git";
import { projects } from "../../src/db/schema";
import { createTestHost, type TestHost } from "../helpers/createTestHost";

/**
 * Real temp git working tree with a remote, plus a `projects` row pointing
 * at it. Procedures resolve owner/name from the live remote, so tests need
 * a real `.git` — no fake substitutes for `git remote get-url`.
 */
async function seedRepoFixture(
	host: TestHost,
	projectId: string,
	remoteUrl: string,
): Promise<string> {
	const dir = mkdtempSync(join(tmpdir(), "ws-creation-github-test-"));
	const git = simpleGit(dir);
	await git.init(["--initial-branch=main"]);
	await git.addRemote("origin", remoteUrl);
	host.db
		.insert(projects)
		.values({
			id: projectId,
			repoPath: dir,
			repoProvider: "github",
			repoOwner: null,
			repoName: null,
			repoUrl: null,
			remoteName: "origin",
		})
		.run();
	return dir;
}

describe("workspaceCreation github procedures with mocked Octokit", () => {
	let host: TestHost;
	let repoDir: string;
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
						merged_at: null,
						user: { login: "bob" },
						head: { ref: "feature/x", sha: "headsha33" },
						base: { ref: "main" },
						draft: false,
						requested_reviewers: [{ login: "me-user" }],
						requested_teams: [{ slug: "core" }],
					},
				};
			},
		},
		users: {
			getAuthenticated: async () => {
				calls.push({ method: "users.getAuthenticated", args: {} });
				return { data: { login: "me-user" } };
			},
		},
		graphql: async (query: string, variables: Record<string, string>) => {
			calls.push({ method: "graphql", args: { query, variables } });
			// Inner data object, no `{data}` envelope — octokit.graphql unwraps it.
			return {
				repository: {
					pr88: {
						number: 88,
						statusCheckRollup: {
							contexts: {
								pageInfo: { hasNextPage: false, endCursor: null },
								nodes: [
									{
										__typename: "CheckRun",
										name: "CI",
										status: "COMPLETED",
										conclusion: "SUCCESS",
										detailsUrl: "https://github.com/octocat/hello/actions/2",
									},
								],
							},
						},
					},
				},
			};
		},
		rest: {
			pulls: {
				listReviews: async (args: unknown) => {
					calls.push({ method: "pulls.listReviews", args });
					return {
						data: [
							{
								user: { login: "carol" },
								state: "APPROVED",
								submitted_at: "2026-08-01T00:00:00Z",
							},
						],
					};
				},
			},
			checks: {
				listForRef: async (args: unknown) => {
					calls.push({ method: "checks.listForRef", args });
					return {
						data: {
							check_runs: [
								{
									name: "Build",
									status: "completed",
									conclusion: "failure",
									details_url: "https://github.com/octocat/hello/runs/5",
								},
							],
						},
					};
				},
			},
			repos: {
				listCommitStatusesForRef: async (args: unknown) => {
					calls.push({ method: "repos.listCommitStatusesForRef", args });
					return { data: [] };
				},
			},
		},
		search: {
			issuesAndPullRequests: async (args: unknown) => {
				calls.push({ method: "search.issuesAndPullRequests", args });
				const searchArgs = args as { page?: number; q: string };
				if (searchArgs.q.includes("many results")) {
					return {
						data: {
							total_count: 5000,
							items: [
								{
									number: 900,
									title: "deep result",
									html_url: "https://github.com/octocat/hello/pull/900",
									state: "open",
									user: { login: "carol" },
									pull_request: { merged_at: null },
								},
							],
						},
					};
				}
				if (searchArgs.q.includes("with checks")) {
					return {
						data: {
							total_count: 1,
							items: [
								{
									number: 88,
									title: "PR with checks",
									html_url: "https://github.com/octocat/hello/pull/88",
									state: "open",
									user: { login: "carol" },
									pull_request: { merged_at: null },
								},
							],
						},
					};
				}
				return {
					data: {
						total_count: 1,
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
		host = await createTestHost({ githubFactory: async () => fakeOctokit });
		repoDir = await seedRepoFixture(
			host,
			projectId,
			"https://github.com/octocat/hello.git",
		);
	});

	afterEach(async () => {
		await host.dispose();
		rmSync(repoDir, { recursive: true, force: true });
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
			author: "@BOB",
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

	test("searchPullRequests filters a direct lookup by author", async () => {
		const result = await host.trpc.workspaceCreation.searchPullRequests.query({
			projectId,
			query: "#33",
			author: "alice",
		});
		expect(result.pullRequests).toEqual([]);
		expect(result.totalCount).toBe(0);
		expect(calls[0].method).toBe("pulls.get");
	});

	test("searchPullRequests rejects an invalid GitHub author", async () => {
		await expect(
			host.trpc.workspaceCreation.searchPullRequests.query({
				projectId,
				author: "octo--cat",
			}),
		).rejects.toThrow("Author must be a valid GitHub username");
		expect(calls).toHaveLength(0);
	});

	test("searchPullRequests checks a direct lookup's review decision without the Search API", async () => {
		const result = await host.trpc.workspaceCreation.searchPullRequests.query({
			projectId,
			query: "#33",
			review: "approved",
		});
		expect(result.pullRequests).toHaveLength(1);
		expect(result.pullRequests[0].prNumber).toBe(33);
		expect(calls[0].method).toBe("pulls.get");
		expect(calls[1]).toMatchObject({
			method: "pulls.listReviews",
			args: { owner: "octocat", repo: "hello", pull_number: 33 },
		});
		expect(calls.map((call) => call.method)).not.toContain(
			"search.issuesAndPullRequests",
		);
	});

	test("searchPullRequests returns empty when the review decision doesn't match", async () => {
		const result = await host.trpc.workspaceCreation.searchPullRequests.query({
			projectId,
			query: "#33",
			review: "changes-requested",
		});
		expect(result.pullRequests).toEqual([]);
		expect(result.totalCount).toBe(0);
		expect(calls.map((call) => call.method)).toEqual([
			"pulls.get",
			"pulls.listReviews",
		]);
	});

	test("searchPullRequests matches review-requested against the viewer", async () => {
		const result = await host.trpc.workspaceCreation.searchPullRequests.query({
			projectId,
			query: "#33",
			review: "review-requested",
		});
		expect(result.pullRequests).toHaveLength(1);
		expect(result.pullRequests[0].prNumber).toBe(33);
		expect(calls.map((call) => call.method).slice(0, 2)).toEqual([
			"pulls.get",
			"users.getAuthenticated",
		]);
		expect(calls.map((call) => call.method)).not.toContain(
			"search.issuesAndPullRequests",
		);
	});

	test("searchPullRequests enriches an Octokit direct lookup with real checks", async () => {
		const result = await host.trpc.workspaceCreation.searchPullRequests.query({
			projectId,
			query: "#33",
		});
		expect(result.pullRequests).toHaveLength(1);
		expect(result.pullRequests[0].checks).toEqual([
			{
				name: "Build",
				status: "failure",
				url: "https://github.com/octocat/hello/runs/5",
			},
		]);
		expect(result.pullRequests[0].checksStatus).toBe("failure");
		expect(calls.map((call) => call.method)).toContain("checks.listForRef");
	});

	test("searchPullRequests enriches Octokit search results via GraphQL checks", async () => {
		const result = await host.trpc.workspaceCreation.searchPullRequests.query({
			projectId,
			query: "with checks",
		});
		expect(result.pullRequests).toHaveLength(1);
		expect(result.pullRequests[0].prNumber).toBe(88);
		expect(result.pullRequests[0].checks).toEqual([
			{
				name: "CI",
				status: "success",
				url: "https://github.com/octocat/hello/actions/2",
			},
		]);
		expect(result.pullRequests[0].checksStatus).toBe("success");
		const graphqlCall = calls.find((call) => call.method === "graphql");
		expect(graphqlCall).toBeDefined();
		expect(
			(graphqlCall?.args as { variables: Record<string, string> }).variables,
		).toMatchObject({ owner: "octocat", name: "hello" });
	});

	test("searchPullRequests clamps Octokit pagination to GitHub's 1000-result cap", async () => {
		const midway = await host.trpc.workspaceCreation.searchPullRequests.query({
			projectId,
			query: "many results",
			limit: 100,
			page: 5,
		});
		expect(midway.totalCount).toBe(5000);
		expect(midway.hasNextPage).toBe(true);

		const atCap = await host.trpc.workspaceCreation.searchPullRequests.query({
			projectId,
			query: "many results",
			limit: 100,
			page: 10,
		});
		expect(atCap.totalCount).toBe(5000);
		expect(atCap.hasNextPage).toBe(false);
	});

	test("searchPullRequests filters search results to PRs only", async () => {
		const result = await host.trpc.workspaceCreation.searchPullRequests.query({
			projectId,
			query: "find me",
			author: "carol",
			review: "approved",
		});
		// Our fake search returns one issue (no `pull_request`), so no PRs.
		expect(result.pullRequests).toEqual([]);
		expect(calls[0].method).toBe("search.issuesAndPullRequests");
		const searchArgs = calls[0].args as { q: string };
		expect(searchArgs.q).toContain("author:carol");
		expect(searchArgs.q).toContain("review:approved");
	});
});

describe("resolveGithubRepo trusts the live local remote, never the cloud", () => {
	let host: TestHost;
	let repoDir: string;
	const projectId = randomUUID();

	const fakeOctokit = {
		pulls: {
			get: async () => ({
				data: {
					number: 33,
					title: "PR #33",
					html_url: "https://github.com/cli/cli/pull/33",
					state: "open",
					user: { login: "bob" },
					draft: false,
					merged_at: null,
				},
			}),
		},
	};

	beforeEach(async () => {
		// The resolver MUST follow the local remote (`cli/cli`). Any cloud
		// call at all fails the test — the fake throws on unmocked procedures.
		host = await createTestHost({
			githubFactory: async () => fakeOctokit,
		});
		repoDir = await seedRepoFixture(
			host,
			projectId,
			"https://github.com/cli/cli.git",
		);
	});

	afterEach(async () => {
		await host.dispose();
		rmSync(repoDir, { recursive: true, force: true });
	});

	test("searchPullRequests routes the call against the local remote's owner/name", async () => {
		const result = await host.trpc.workspaceCreation.searchPullRequests.query({
			projectId,
			query: "#33",
		});
		expect(result.pullRequests).toHaveLength(1);
		expect(result.pullRequests[0].url).toContain("github.com/cli/cli");
	});
});

describe("resolveGithubRepo prefers the user-configured remoteName", () => {
	let host: TestHost;
	let repoDir: string;
	const projectId = randomUUID();

	const fakeOctokit = {
		pulls: {
			get: async () => ({
				data: {
					number: 5,
					title: "via upstream",
					html_url: "https://github.com/upstream-org/cli/pull/5",
					state: "open",
					user: { login: "ada" },
					draft: false,
					merged_at: null,
				},
			}),
		},
		issues: { get: async () => ({ data: {} }) },
		search: {
			issuesAndPullRequests: async () => ({
				data: { total_count: 0, items: [] },
			}),
		},
	};

	beforeEach(async () => {
		host = await createTestHost({ githubFactory: async () => fakeOctokit });
		// origin → user's fork, upstream → real source, configured = upstream.
		// Resolver must honor `remoteName=upstream`, not default to origin.
		repoDir = mkdtempSync(join(tmpdir(), "ws-creation-github-test-"));
		const git = simpleGit(repoDir);
		await git.init(["--initial-branch=main"]);
		await git.addRemote("origin", "https://github.com/me/cli.git");
		await git.addRemote("upstream", "https://github.com/upstream-org/cli.git");
		host.db
			.insert(projects)
			.values({
				id: projectId,
				repoPath: repoDir,
				repoProvider: "github",
				repoOwner: null,
				repoName: null,
				repoUrl: null,
				remoteName: "upstream",
			})
			.run();
	});

	afterEach(async () => {
		await host.dispose();
		rmSync(repoDir, { recursive: true, force: true });
	});

	test("searchPullRequests routes against `upstream`, not `origin`", async () => {
		const result = await host.trpc.workspaceCreation.searchPullRequests.query({
			projectId,
			query: "#5",
		});
		expect(result.pullRequests).toHaveLength(1);
		expect(result.pullRequests[0].url).toContain("github.com/upstream-org/cli");
	});
});

describe("both backends failing rethrows so the renderer toast fires", () => {
	let host: TestHost;
	let repoDir: string;
	const projectId = randomUUID();

	const failingOctokit = {
		pulls: {
			get: async () => {
				throw new Error("octokit pulls.get failed");
			},
		},
		issues: {
			get: async () => {
				throw new Error("octokit issues.get failed");
			},
		},
		search: {
			issuesAndPullRequests: async () => {
				throw new Error("octokit search failed");
			},
		},
	};
	const failingExecGh = async (): Promise<unknown> => {
		throw new Error("gh exec failed");
	};

	beforeEach(async () => {
		host = await createTestHost({
			githubFactory: async () => failingOctokit,
			execGh: failingExecGh,
		});
		repoDir = await seedRepoFixture(
			host,
			projectId,
			"https://github.com/octocat/hello.git",
		);
	});

	afterEach(async () => {
		await host.dispose();
		rmSync(repoDir, { recursive: true, force: true });
	});

	test("searchPullRequests rethrows when both gh and Octokit fail", async () => {
		await expect(
			host.trpc.workspaceCreation.searchPullRequests.query({
				projectId,
				query: "anything",
			}),
		).rejects.toThrow();
	});

	test("searchGitHubIssues rethrows when both gh and Octokit fail", async () => {
		await expect(
			host.trpc.workspaceCreation.searchGitHubIssues.query({
				projectId,
				query: "anything",
			}),
		).rejects.toThrow();
	});
});

describe("resolveGithubRepo throws PROJECT_NOT_SETUP when no local clone", () => {
	let host: TestHost;
	const projectId = randomUUID();

	beforeEach(async () => {
		host = await createTestHost();
	});

	afterEach(async () => {
		await host.dispose();
	});

	test("searchPullRequests refuses to query GitHub without a local clone", async () => {
		await expect(
			host.trpc.workspaceCreation.searchPullRequests.query({
				projectId,
				query: "#1",
			}),
		).rejects.toThrow(/Project is not set up on this host/);
	});
});

describe("gh CLI is first-class when execGh succeeds", () => {
	let host: TestHost;
	let repoDir: string;
	const projectId = randomUUID();
	const ghCalls: Array<{ args: string[]; cwd?: string }> = [];

	// Octokit must NOT be hit when gh succeeds — throws turn accidental
	// fallbacks into loud failures.
	const fakeOctokit = {
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
		if (args[0] === "pr" && args[1] === "view") {
			return {
				number: Number(args[2]),
				title: "PR via gh",
				url: `https://github.com/octocat/hello/pull/${args[2]}`,
				state: "OPEN",
				isDraft: false,
				author: { login: "bob" },
				mergedAt: null,
				statusCheckRollup: null,
				reviewDecision: "REVIEW_REQUIRED",
				reviewRequests: [{ name: "core", slug: "core" }],
				latestReviews: [{ author: { login: "bob" }, state: "COMMENTED" }],
			};
		}
		if (args[0] === "api" && args[1] === "user") {
			return { login: "bob" };
		}
		if (args[0] === "api" && args[1]?.startsWith("orgs/octocat/teams/")) {
			return { state: "active" };
		}
		if (args[0] === "api" && args[1] === "graphql") {
			const isNextChecksPage = args.includes("cursor101=checks-page-2");
			return {
				data: {
					repository: {
						pr101: {
							number: 101,
							statusCheckRollup: {
								contexts: {
									pageInfo: {
										hasNextPage: !isNextChecksPage,
										endCursor: isNextChecksPage ? null : "checks-page-2",
									},
									nodes: [
										{
											__typename: "CheckRun",
											name: isNextChecksPage ? "Tests" : "Typecheck",
											status: "COMPLETED",
											conclusion: isNextChecksPage ? "FAILURE" : "SUCCESS",
											detailsUrl: "https://github.com/octocat/hello/actions/1",
										},
									],
								},
							},
						},
					},
				},
			};
		}
		if (args[0] === "api" && args.includes("search/issues")) {
			const qIndex = args.indexOf("-f");
			const q = args[qIndex + 1] ?? "";
			const isPr = q.includes("is:pr");
			if (isPr) {
				return {
					total_count: 1,
					items: [
						{
							number: 101,
							title: "search result",
							html_url: "https://github.com/octocat/hello/pull/101",
							state: "open",
							user: { login: "carol" },
							pull_request: { merged_at: null },
						},
					],
				};
			}
			return {
				total_count: 1,
				items: [
					{
						number: 7,
						title: "issue search result",
						html_url: "https://github.com/octocat/hello/issues/7",
						state: "open",
						user: { login: "dave" },
						updated_at: "2026-08-05T11:00:00Z",
					},
				],
			};
		}
		return {};
	};

	beforeEach(async () => {
		ghCalls.length = 0;
		host = await createTestHost({
			githubFactory: async () => fakeOctokit,
			execGh: fakeExecGh,
		});
		repoDir = await seedRepoFixture(
			host,
			projectId,
			"https://github.com/octocat/hello.git",
		);
	});

	afterEach(async () => {
		await host.dispose();
		rmSync(repoDir, { recursive: true, force: true });
	});

	test("searchPullRequests #N invokes `gh pr view` with cwd=repoPath", async () => {
		const result = await host.trpc.workspaceCreation.searchPullRequests.query({
			projectId,
			query: "#33",
			author: "bob",
		});
		expect(result.pullRequests).toHaveLength(1);
		expect(result.pullRequests[0].prNumber).toBe(33);
		expect(result.pullRequests[0].title).toBe("PR via gh");
		expect(result.pullRequests[0].checks).toEqual([]);
		expect(ghCalls).toHaveLength(1);
		expect(ghCalls[0].args.slice(0, 5)).toEqual([
			"pr",
			"view",
			"33",
			"--repo",
			"octocat/hello",
		]);
		// `rev-parse --show-toplevel` canonicalizes /var → /private/var on macOS.
		expect(ghCalls[0].cwd).toBe(realpathSync(repoDir));
	});

	test("searchPullRequests filters a gh direct lookup by author", async () => {
		const result = await host.trpc.workspaceCreation.searchPullRequests.query({
			projectId,
			query: "#33",
			author: "alice",
		});
		expect(result.pullRequests).toEqual([]);
		expect(result.totalCount).toBe(0);
		expect(ghCalls).toHaveLength(1);
	});

	test("searchPullRequests matches a gh direct lookup's review decision in one call", async () => {
		const result = await host.trpc.workspaceCreation.searchPullRequests.query({
			projectId,
			query: "#33",
			review: "required",
		});
		expect(result.pullRequests).toHaveLength(1);
		expect(result.pullRequests[0].prNumber).toBe(33);
		expect(ghCalls).toHaveLength(1);
		expect(ghCalls[0].args.slice(0, 3)).toEqual(["pr", "view", "33"]);
	});

	test("searchPullRequests returns empty when a gh direct lookup misses the review filter", async () => {
		const result = await host.trpc.workspaceCreation.searchPullRequests.query({
			projectId,
			query: "#33",
			review: "none",
		});
		expect(result.pullRequests).toEqual([]);
		expect(result.totalCount).toBe(0);
		expect(ghCalls).toHaveLength(1);
		expect(ghCalls[0].args.slice(0, 3)).toEqual(["pr", "view", "33"]);
	});

	test("searchPullRequests resolves @me review filters from the PR's own reviews", async () => {
		const result = await host.trpc.workspaceCreation.searchPullRequests.query({
			projectId,
			query: "#33",
			review: "reviewed-by-me",
		});
		expect(result.pullRequests).toHaveLength(1);
		expect(result.pullRequests[0].prNumber).toBe(33);
		expect(ghCalls).toHaveLength(2);
		expect(ghCalls[1].args).toEqual(["api", "user"]);
	});

	test("searchPullRequests checks requested-team membership for team review filters", async () => {
		const result = await host.trpc.workspaceCreation.searchPullRequests.query({
			projectId,
			query: "#33",
			review: "team-review-requested",
		});
		expect(result.pullRequests).toHaveLength(1);
		expect(result.pullRequests[0].prNumber).toBe(33);
		expect(ghCalls).toHaveLength(3);
		expect(ghCalls[1].args).toEqual(["api", "user"]);
		expect(ghCalls[2].args).toEqual([
			"api",
			"orgs/octocat/teams/core/memberships/bob",
		]);
	});

	test("searchPullRequests free-text invokes `gh api search/issues` with is:pr filter", async () => {
		const result = await host.trpc.workspaceCreation.searchPullRequests.query({
			projectId,
			query: "find me",
			author: "carol",
			review: "team-review-requested",
		});
		expect(result.pullRequests).toHaveLength(1);
		expect(result.pullRequests[0].prNumber).toBe(101);
		expect(result.pullRequests[0].title).toBe("search result");
		expect(result.totalCount).toBe(1);
		expect(result.hasNextPage).toBe(false);
		expect(ghCalls).toHaveLength(3);
		const args = ghCalls[0].args;
		expect(args[0]).toBe("api");
		expect(args).toContain("search/issues");
		const qArg = args[args.indexOf("-f") + 1] ?? "";
		expect(qArg).toContain("repo:octocat/hello");
		expect(qArg).toContain("is:pr");
		expect(qArg).toContain("is:open");
		expect(qArg).toContain("find me");
		expect(qArg).toContain("author:carol");
		expect(qArg).toContain("review-requested:@me");
		expect(qArg).not.toContain("team-review-requested:@me");
		expect(ghCalls[1].args.slice(0, 2)).toEqual(["api", "graphql"]);
		expect(ghCalls[1].args.join(" ")).toContain("pullRequest(number:101)");
		expect(ghCalls[1].args.join(" ")).not.toContain("pullRequest(number:999)");
		expect(ghCalls[1].args).toContain("owner=octocat");
		expect(ghCalls[1].args).toContain("name=hello");
		for (const variable of ["owner=octocat", "name=hello"]) {
			const variableIndex = ghCalls[1].args.indexOf(variable);
			expect(ghCalls[1].args[variableIndex - 1]).toBe("-f");
		}
		expect(ghCalls[2].args).toContain("cursor101=checks-page-2");
		expect(ghCalls[2].args.join(" ")).toContain(
			"contexts(first: 100, after: $cursor101)",
		);
		expect(result.pullRequests[0].checks).toHaveLength(2);
		expect(result.pullRequests[0].checksStatus).toBe("failure");
	});

	test("searchPullRequests distinguishes individual review requests", async () => {
		await host.trpc.workspaceCreation.searchPullRequests.query({
			projectId,
			query: "find me",
			review: "review-requested",
		});
		const searchCall = ghCalls.find(
			(call) => call.args[0] === "api" && call.args.includes("search/issues"),
		);
		expect(searchCall).toBeDefined();
		expect(searchCall?.args.join(" ")).toContain("user-review-requested:@me");
	});

	test("searchGitHubIssues #N filters out PRs leaked by `gh issue view`", async () => {
		// gh CLI happily returns a PR when `gh issue view <pr-number>` is
		// called — the URL is the only signal we have to detect it.
		const localHost = await createTestHost({
			githubFactory: async () => fakeOctokit,
			execGh: async (args) => {
				if (args[0] === "issue" && args[1] === "view") {
					return {
						number: Number(args[2]),
						title: "Should be filtered",
						url: `https://github.com/octocat/hello/pull/${args[2]}`,
						state: "OPEN",
						author: { login: "x" },
					};
				}
				return {};
			},
		});
		const localRepo = await seedRepoFixture(
			localHost,
			projectId,
			"https://github.com/octocat/hello.git",
		);
		const result =
			await localHost.trpc.workspaceCreation.searchGitHubIssues.query({
				projectId,
				query: "#13353",
			});
		expect(result.issues).toEqual([]);
		await localHost.dispose();
		rmSync(localRepo, { recursive: true, force: true });
	});

	test("searchGitHubIssues free-text invokes `gh api search/issues` with is:issue filter", async () => {
		const result = await host.trpc.workspaceCreation.searchGitHubIssues.query({
			projectId,
			query: "bug",
		});
		expect(result.issues).toHaveLength(1);
		expect(result.issues[0].issueNumber).toBe(7);
		expect(result.issues[0].updatedAt).toBe("2026-08-05T11:00:00Z");
		expect(result.totalCount).toBe(1);
		expect(result.hasNextPage).toBe(false);
		expect(ghCalls).toHaveLength(1);
		const args = ghCalls[0].args;
		expect(args[0]).toBe("api");
		expect(args).toContain("search/issues");
		const qArg = args[args.indexOf("-f") + 1] ?? "";
		expect(qArg).toContain("repo:octocat/hello");
		expect(qArg).toContain("is:issue");
		expect(qArg).toContain("bug");
	});
});

describe("multi-project batched search over gh", () => {
	let host: TestHost;
	let repoA: string;
	let repoB: string;
	const projectA = randomUUID();
	const projectB = randomUUID();
	const ghCalls: Array<{ args: string[]; cwd?: string }> = [];

	// Octokit must NOT be hit when gh succeeds.
	const fakeOctokit = {
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

	const searchCalls = () =>
		ghCalls.filter((call) => call.args.includes("search/issues"));
	const qOf = (call: { args: string[] }) =>
		(call.args[call.args.indexOf("-f") + 1] ?? "").replace(/^q=/, "");

	const fakeExecGh = async (
		args: string[],
		options?: { cwd?: string },
	): Promise<unknown> => {
		ghCalls.push({ args, cwd: options?.cwd });
		if (args[0] === "api" && args.includes("search/issues")) {
			const q = qOf({ args });
			const isPr = q.includes("is:pr");
			if (isPr) {
				return {
					total_count: 2,
					items: [
						{
							number: 5,
							title: "hello PR",
							html_url: "https://github.com/octocat/hello/pull/5",
							repository_url: "https://api.github.com/repos/octocat/hello",
							state: "open",
							user: { login: "alice" },
							pull_request: { merged_at: null },
							updated_at: "2026-08-01T00:00:00Z",
						},
						{
							number: 9,
							title: "world PR",
							// Case difference exercises case-insensitive attribution.
							repository_url: "https://api.github.com/repos/OctoCat/World",
							html_url: "https://github.com/octocat/world/pull/9",
							state: "open",
							user: { login: "bob" },
							pull_request: { merged_at: null },
							updated_at: "2026-08-02T00:00:00Z",
						},
						{
							number: 11,
							title: "stray from an unrequested repo",
							html_url: "https://github.com/some/other/pull/11",
							repository_url: "https://api.github.com/repos/some/other",
							state: "open",
							user: { login: "eve" },
							pull_request: { merged_at: null },
							updated_at: "2026-08-03T00:00:00Z",
						},
					],
				};
			}
			return {
				total_count: 2,
				items: [
					{
						number: 21,
						title: "hello issue",
						html_url: "https://github.com/octocat/hello/issues/21",
						repository_url: "https://api.github.com/repos/octocat/hello",
						state: "open",
						user: { login: "alice" },
						updated_at: "2026-08-01T00:00:00Z",
					},
					{
						number: 22,
						title: "world issue",
						html_url: "https://github.com/octocat/world/issues/22",
						repository_url: "https://api.github.com/repos/octocat/world",
						state: "open",
						user: { login: "bob" },
						updated_at: "2026-08-02T00:00:00Z",
					},
				],
			};
		}
		if (args[0] === "api" && args[1] === "graphql") {
			return { data: { repository: null } };
		}
		if (args[0] === "pr" && args[1] === "view") {
			const repoArg = args[args.indexOf("--repo") + 1] ?? "";
			if (args[2] === "404" && repoArg === "octocat/hello") {
				throw new Error(
					"GraphQL: Could not resolve to a PullRequest with the number of 404. (repository.pullRequest)",
				);
			}
			return {
				number: Number(args[2]),
				title: `PR in ${repoArg}`,
				url: `https://github.com/${repoArg}/pull/${args[2]}`,
				state: "OPEN",
				isDraft: false,
				author: { login: "bob" },
				mergedAt: null,
				updatedAt: repoArg.endsWith("world")
					? "2026-08-04T00:00:00Z"
					: "2026-08-03T00:00:00Z",
				statusCheckRollup: null,
			};
		}
		if (args[0] === "issue" && args[1] === "view") {
			const repoArg = args[args.indexOf("--repo") + 1] ?? "";
			return {
				number: Number(args[2]),
				title: `Issue in ${repoArg}`,
				url: `https://github.com/${repoArg}/issues/${args[2]}`,
				state: "OPEN",
				author: { login: "alice" },
				updatedAt: repoArg.endsWith("world")
					? "2026-08-04T00:00:00Z"
					: "2026-08-03T00:00:00Z",
			};
		}
		return {};
	};

	beforeEach(async () => {
		ghCalls.length = 0;
		host = await createTestHost({
			githubFactory: async () => fakeOctokit,
			execGh: fakeExecGh,
		});
		repoA = await seedRepoFixture(
			host,
			projectA,
			"https://github.com/octocat/hello.git",
		);
		repoB = await seedRepoFixture(
			host,
			projectB,
			"https://github.com/octocat/world.git",
		);
	});

	afterEach(async () => {
		await host.dispose();
		rmSync(repoA, { recursive: true, force: true });
		rmSync(repoB, { recursive: true, force: true });
	});

	test("searchPullRequests batches both repos into one search call and attributes rows", async () => {
		const result = await host.trpc.workspaceCreation.searchPullRequests.query({
			projectId: projectA,
			projectIds: [projectA, projectB],
			query: "find me",
		});
		expect(searchCalls()).toHaveLength(1);
		expect(qOf(searchCalls()[0])).toBe(
			"repo:octocat/hello repo:octocat/world is:pr is:open find me",
		);
		// Merged newest-first; the stray repo's item is dropped.
		expect(
			result.pullRequests.map((pr) => [pr.prNumber, pr.projectId]),
		).toEqual([
			[9, projectB],
			[5, projectA],
		]);
		expect(result.totalCount).toBe(2);
		// Checks enrichment fans out one GraphQL batch per repo with rows.
		const graphqlCalls = ghCalls.filter((call) => call.args[1] === "graphql");
		expect(graphqlCalls).toHaveLength(2);
		const graphqlRepoNames = graphqlCalls.map((call) =>
			call.args.find((arg) => arg.startsWith("name=")),
		);
		expect(graphqlRepoNames.sort()).toEqual(["name=hello", "name=world"]);
	});

	test("searchPullRequests with projectIds absent stays single-repo", async () => {
		const result = await host.trpc.workspaceCreation.searchPullRequests.query({
			projectId: projectA,
			query: "find me",
		});
		expect(searchCalls()).toHaveLength(1);
		expect(qOf(searchCalls()[0])).toBe(
			"repo:octocat/hello is:pr is:open find me",
		);
		// Single-repo chunks attribute rows without repository_url matching.
		expect(result.pullRequests.every((pr) => pr.projectId === projectA)).toBe(
			true,
		);
	});

	test("searchPullRequests URL lookup picks the matching repo out of the batch", async () => {
		const result = await host.trpc.workspaceCreation.searchPullRequests.query({
			projectId: projectA,
			projectIds: [projectA, projectB],
			query: "https://github.com/octocat/world/pull/9",
		});
		expect(result.pullRequests).toHaveLength(1);
		expect(result.pullRequests[0].prNumber).toBe(9);
		expect(result.pullRequests[0].projectId).toBe(projectB);
		expect(searchCalls()).toHaveLength(0);
		const prViewCalls = ghCalls.filter((call) => call.args[0] === "pr");
		expect(prViewCalls).toHaveLength(1);
		expect(prViewCalls[0].args.slice(0, 5)).toEqual([
			"pr",
			"view",
			"9",
			"--repo",
			"octocat/world",
		]);
	});

	test("searchPullRequests URL matching no requested repo lists them all in repoMismatch", async () => {
		const result = await host.trpc.workspaceCreation.searchPullRequests.query({
			projectId: projectA,
			projectIds: [projectA, projectB],
			query: "https://github.com/other/repo/pull/1",
		});
		expect(result.pullRequests).toEqual([]);
		expect(result.repoMismatch).toBe("octocat/hello, octocat/world");
		expect(ghCalls).toHaveLength(0);
	});

	test("searchPullRequests bare #N fans out per repo and merges newest-first", async () => {
		const result = await host.trpc.workspaceCreation.searchPullRequests.query({
			projectId: projectA,
			projectIds: [projectA, projectB],
			query: "#7",
		});
		expect(searchCalls()).toHaveLength(0);
		expect(
			result.pullRequests.map((pr) => [pr.projectId, pr.updatedAt]),
		).toEqual([
			[projectB, "2026-08-04T00:00:00Z"],
			[projectA, "2026-08-03T00:00:00Z"],
		]);
		expect(result.totalCount).toBe(2);
	});

	test("searchPullRequests bare #N skips repos where the PR doesn't exist", async () => {
		const result = await host.trpc.workspaceCreation.searchPullRequests.query({
			projectId: projectA,
			projectIds: [projectA, projectB],
			query: "#404",
		});
		expect(result.pullRequests).toHaveLength(1);
		expect(result.pullRequests[0].projectId).toBe(projectB);
		expect(result.totalCount).toBe(1);
	});

	test("searchGitHubIssues batches both repos into one search call and attributes rows", async () => {
		const result = await host.trpc.workspaceCreation.searchGitHubIssues.query({
			projectId: projectA,
			projectIds: [projectA, projectB],
			query: "bug",
		});
		expect(searchCalls()).toHaveLength(1);
		expect(qOf(searchCalls()[0])).toBe(
			"repo:octocat/hello repo:octocat/world is:issue is:open bug",
		);
		expect(
			result.issues.map((issue) => [issue.issueNumber, issue.projectId]),
		).toEqual([
			[22, projectB],
			[21, projectA],
		]);
		expect(result.totalCount).toBe(2);
	});

	test("searchGitHubIssues bare #N fans out per repo and merges", async () => {
		const result = await host.trpc.workspaceCreation.searchGitHubIssues.query({
			projectId: projectA,
			projectIds: [projectA, projectB],
			query: "#7",
		});
		expect(searchCalls()).toHaveLength(0);
		expect(result.issues.map((issue) => issue.projectId)).toEqual([
			projectB,
			projectA,
		]);
		expect(result.totalCount).toBe(2);
	});
});

describe("multi-project search chunks repo qualifiers at 256 chars", () => {
	let host: TestHost;
	let repoA: string;
	let repoB: string;
	const projectA = randomUUID();
	const projectB = randomUUID();
	// Two ~127-char repo qualifiers can't share a 256-char query once the
	// `is:pr is:open find me` suffix is added.
	const longNameA = `a${"n".repeat(110)}`;
	const longNameB = `b${"n".repeat(110)}`;
	const ghCalls: Array<{ args: string[] }> = [];

	const fakeExecGh = async (args: string[]): Promise<unknown> => {
		ghCalls.push({ args });
		if (args[0] === "api" && args.includes("search/issues")) {
			return { total_count: 0, items: [] };
		}
		return {};
	};

	beforeEach(async () => {
		ghCalls.length = 0;
		host = await createTestHost({ execGh: fakeExecGh });
		repoA = await seedRepoFixture(
			host,
			projectA,
			`https://github.com/octo-long/${longNameA}.git`,
		);
		repoB = await seedRepoFixture(
			host,
			projectB,
			`https://github.com/octo-long/${longNameB}.git`,
		);
	});

	afterEach(async () => {
		await host.dispose();
		rmSync(repoA, { recursive: true, force: true });
		rmSync(repoB, { recursive: true, force: true });
	});

	test("searchPullRequests issues one search call per chunk", async () => {
		const result = await host.trpc.workspaceCreation.searchPullRequests.query({
			projectId: projectA,
			projectIds: [projectA, projectB],
			query: "find me",
		});
		const searchCalls = ghCalls.filter((call) =>
			call.args.includes("search/issues"),
		);
		expect(searchCalls).toHaveLength(2);
		const queries = searchCalls.map((call) =>
			(call.args[call.args.indexOf("-f") + 1] ?? "").replace(/^q=/, ""),
		);
		expect(queries).toEqual([
			`repo:octo-long/${longNameA} is:pr is:open find me`,
			`repo:octo-long/${longNameB} is:pr is:open find me`,
		]);
		for (const query of queries) {
			expect(query.length).toBeLessThanOrEqual(256);
		}
		expect(result.pullRequests).toEqual([]);
		expect(result.hasNextPage).toBe(false);
	});
});

describe("GitHub rate-limit errors map to TOO_MANY_REQUESTS", () => {
	let host: TestHost;
	let repoDir: string;
	const projectId = randomUUID();

	afterEach(async () => {
		await host.dispose();
		rmSync(repoDir, { recursive: true, force: true });
	});

	const expectTooManyRequests = async (
		promise: Promise<unknown>,
	): Promise<{ message: string; data?: { code?: string } }> => {
		const error = await promise.then(
			() => null,
			(err: { message: string; data?: { code?: string } }) => err,
		);
		expect(error).not.toBeNull();
		if (!error) throw new Error("unreachable");
		expect(error.message).toContain(
			"GitHub API rate limit exceeded. Try again in a few minutes.",
		);
		expect(error.data?.code).toBe("TOO_MANY_REQUESTS");
		return error;
	};

	test("gh search rate limit throws typed error without falling back to Octokit", async () => {
		const octokitCalls: string[] = [];
		host = await createTestHost({
			githubFactory: async () => ({
				search: {
					issuesAndPullRequests: async () => {
						octokitCalls.push("search");
						return { data: { total_count: 0, items: [] } };
					},
				},
			}),
			execGh: async (args: string[]) => {
				if (args.includes("search/issues")) {
					throw new Error(
						"HTTP 403: API rate limit exceeded for user ID 1 (https://api.github.com/search/issues)",
					);
				}
				return {};
			},
		});
		repoDir = await seedRepoFixture(
			host,
			projectId,
			"https://github.com/octocat/hello.git",
		);
		await expectTooManyRequests(
			host.trpc.workspaceCreation.searchPullRequests.query({
				projectId,
				query: "anything",
			}),
		);
		await expectTooManyRequests(
			host.trpc.workspaceCreation.searchGitHubIssues.query({
				projectId,
				query: "anything",
			}),
		);
		// Never auto-retry a rate-limited search on the Octokit fallback.
		expect(octokitCalls).toEqual([]);
	});

	test("Octokit search rate limit throws typed error with the reset time", async () => {
		const resetEpoch = 1_765_000_000;
		const rateLimitError = () =>
			Object.assign(new Error("API rate limit exceeded for 1.2.3.4"), {
				status: 403,
				response: { headers: { "x-ratelimit-reset": String(resetEpoch) } },
			});
		host = await createTestHost({
			githubFactory: async () => ({
				search: {
					issuesAndPullRequests: async () => {
						throw rateLimitError();
					},
				},
			}),
		});
		repoDir = await seedRepoFixture(
			host,
			projectId,
			"https://github.com/octocat/hello.git",
		);
		const error = await expectTooManyRequests(
			host.trpc.workspaceCreation.searchPullRequests.query({
				projectId,
				query: "anything",
			}),
		);
		expect(error.message).toContain(
			`Rate limit resets at ${new Date(resetEpoch * 1000).toISOString()}.`,
		);
		await expectTooManyRequests(
			host.trpc.workspaceCreation.searchGitHubIssues.query({
				projectId,
				query: "anything",
			}),
		);
	});
});

describe("GitHub rejected-credential errors map to actionable UNAUTHORIZED", () => {
	let host: TestHost;
	let repoDir: string;
	const projectId = randomUUID();

	afterEach(async () => {
		await host.dispose();
		rmSync(repoDir, { recursive: true, force: true });
	});

	const badCredentials = () =>
		Object.assign(new Error("Bad credentials - https://docs.github.com/rest"), {
			status: 401,
		});

	const expectRejection = async (
		promise: Promise<unknown>,
	): Promise<{ message: string; data?: { code?: string } }> => {
		const error = await promise.then(
			() => null,
			(err: { message: string; data?: { code?: string } }) => err,
		);
		expect(error).not.toBeNull();
		if (!error) throw new Error("unreachable");
		return error;
	};

	test("a 401 from both gh and Octokit names the rejected token source", async () => {
		// Default test execGh rejects, standing in for a gh CLI that 401s too.
		host = await createTestHost({
			githubFactory: async () => ({
				search: {
					issuesAndPullRequests: async () => {
						throw badCredentials();
					},
				},
			}),
			githubToken: "stale-token",
			githubTokenSource: "gh-cli",
		});
		repoDir = await seedRepoFixture(
			host,
			projectId,
			"https://github.com/octocat/hello.git",
		);
		const error = await expectRejection(
			host.trpc.workspaceCreation.searchPullRequests.query({
				projectId,
				query: "anything",
			}),
		);
		expect(error.data?.code).toBe("UNAUTHORIZED");
		expect(error.message).toBe(
			"GitHub rejected this machine's gh CLI login (not the Superset integration). Run `gh auth login`, then restart Superset.",
		);
	});

	test("a 401 with an unknown token source falls back to generic guidance", async () => {
		host = await createTestHost({
			githubFactory: async () => ({
				search: {
					issuesAndPullRequests: async () => {
						throw badCredentials();
					},
				},
			}),
			githubToken: "stale-token",
		});
		repoDir = await seedRepoFixture(
			host,
			projectId,
			"https://github.com/octocat/hello.git",
		);
		const error = await expectRejection(
			host.trpc.workspaceCreation.searchGitHubIssues.query({
				projectId,
				query: "anything",
			}),
		);
		expect(error.data?.code).toBe("UNAUTHORIZED");
		expect(error.message).toContain("gh auth login");
	});

	test("a missing token reports where the login must live", async () => {
		host = await createTestHost({ githubToken: null });
		repoDir = await seedRepoFixture(
			host,
			projectId,
			"https://github.com/octocat/hello.git",
		);
		const error = await expectRejection(
			host.trpc.workspaceCreation.searchPullRequests.query({
				projectId,
				query: "anything",
			}),
		);
		expect(error.data?.code).toBe("PRECONDITION_FAILED");
		expect(error.message).toBe(
			"No GitHub login on this machine (the Superset integration doesn't cover this). Run `gh auth login`.",
		);
	});
});
