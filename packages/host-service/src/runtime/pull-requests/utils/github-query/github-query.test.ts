import { describe, expect, test } from "bun:test";
import {
	fetchPullRequestChecks,
	fetchRepositoryPullRequests,
} from "./github-query";

// Issue #4246: GitHub's GraphQL endpoint returns HTTP 504 when the bulk
// PR-listing query also materializes statusCheckRollup.contexts(first: 50)
// for ~100 PRs against a busy repo. The fetcher must not bundle check
// rollups into the listing query; checks have to be fetched separately,
// per-PR, only for the PRs the caller actually cares about.
describe("github-query (large-repo timeout reproduction for #4246)", () => {
	test("listing query does not request statusCheckRollup", async () => {
		const queries: string[] = [];
		const octokit = {
			graphql: async (query: string) => {
				queries.push(query);
				return { repository: { pullRequests: { nodes: [] } } };
			},
		};

		await fetchRepositoryPullRequests(octokit as never, {
			owner: "owner",
			name: "repo",
		});

		expect(queries).toHaveLength(1);
		expect(queries[0]).not.toContain("statusCheckRollup");
	});

	test("listing succeeds even when bulk-rollup queries would 504", async () => {
		const octokit = {
			graphql: async (query: string) => {
				if (
					query.includes("pullRequests(") &&
					query.includes("statusCheckRollup")
				) {
					const error = new Error("GraphQL request failed: 504") as Error & {
						status?: number;
					};
					error.status = 504;
					throw error;
				}
				return {
					repository: {
						pullRequests: {
							nodes: [
								{
									number: 1,
									title: "feature",
									url: "https://github.com/owner/repo/pull/1",
									state: "OPEN",
									isDraft: false,
									headRefName: "feature",
									headRefOid: "abc",
									isCrossRepository: false,
									headRepositoryOwner: { login: "owner" },
									headRepository: { name: "repo" },
									reviewDecision: null,
									updatedAt: "2026-01-01T00:00:00Z",
								},
							],
						},
					},
				};
			},
		};

		const nodes = await fetchRepositoryPullRequests(octokit as never, {
			owner: "owner",
			name: "repo",
		});

		expect(nodes).toHaveLength(1);
		expect(nodes[0]?.number).toBe(1);
	});

	test("fetchPullRequestChecks fetches statusCheckRollup for a single PR", async () => {
		const captured: { query: string; variables: unknown }[] = [];
		const octokit = {
			graphql: async (query: string, variables: unknown) => {
				captured.push({ query, variables });
				return {
					repository: {
						pullRequest: {
							statusCheckRollup: {
								contexts: {
									nodes: [
										{
											__typename: "CheckRun",
											name: "ci",
											conclusion: "SUCCESS",
											detailsUrl: "https://example.com/ci",
											status: "COMPLETED",
											startedAt: null,
											completedAt: null,
											checkSuite: null,
										},
									],
								},
							},
						},
					},
				};
			},
		};

		const checks = await fetchPullRequestChecks(
			octokit as never,
			{ owner: "owner", name: "repo" },
			42,
		);

		expect(checks).toHaveLength(1);
		expect(captured[0]?.query).toContain("statusCheckRollup");
		expect(captured[0]?.query).not.toContain("pullRequests(");
		const vars = captured[0]?.variables as { number: number };
		expect(vars.number).toBe(42);
	});
});
