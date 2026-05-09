import { describe, expect, test } from "bun:test";
import {
	fetchPullRequestChecks,
	fetchRepositoryPullRequests,
} from "./github-query";
import { PULL_REQUEST_CHECKS_QUERY, PULL_REQUESTS_LIST_QUERY } from "./query";

interface RecordedCall {
	query: string;
	variables: Record<string, unknown> | undefined;
}

function makeFakeOctokit(responder: (call: RecordedCall) => unknown) {
	const calls: RecordedCall[] = [];
	const graphql = (query: string, variables?: Record<string, unknown>) => {
		const call = { query, variables };
		calls.push(call);
		return Promise.resolve(responder(call));
	};
	return { octokit: { graphql } as never, calls };
}

describe("PullRequestsForSidebar query splitting (issue #4246)", () => {
	test("PR list query does not request statusCheckRollup (avoids GitHub 504 on large repos)", () => {
		// Root cause of #4246: combining `pullRequests(first: 100)` with
		// `statusCheckRollup.contexts(first: 50)` in a single request makes
		// GitHub's GraphQL server time out (504) on repos with many active
		// PRs and many checks per PR. The list query must stay lightweight.
		expect(PULL_REQUESTS_LIST_QUERY).not.toContain("statusCheckRollup");
	});

	test("checks query targets a single PR by number", () => {
		// Per-PR checks fetch keeps the heavy materialization bounded to
		// the workspaces' matched PRs (typically a handful), not the
		// repo's entire recent PR backlog.
		expect(PULL_REQUEST_CHECKS_QUERY).toContain("statusCheckRollup");
		expect(PULL_REQUEST_CHECKS_QUERY).toContain("pullRequest(number:");
	});

	test("fetchRepositoryPullRequests issues only the lightweight list query", async () => {
		const { octokit, calls } = makeFakeOctokit(() => ({
			repository: {
				pullRequests: {
					nodes: [
						{
							number: 7,
							title: "wip",
							url: "https://github.com/o/r/pull/7",
							state: "OPEN",
							isDraft: false,
							headRefName: "feature",
							headRefOid: "abc",
							isCrossRepository: false,
							headRepositoryOwner: { login: "o" },
							headRepository: { name: "r" },
							reviewDecision: null,
							updatedAt: "2026-05-09T00:00:00Z",
						},
					],
				},
			},
		}));

		await fetchRepositoryPullRequests(octokit, { owner: "o", name: "r" });

		expect(calls).toHaveLength(1);
		expect(calls[0]?.query).not.toContain("statusCheckRollup");
		expect(calls[0]?.variables).toEqual({ owner: "o", repo: "r" });
	});

	test("fetchPullRequestChecks fetches a single PR's checks and parses contexts", async () => {
		const { octokit, calls } = makeFakeOctokit(() => ({
			repository: {
				pullRequest: {
					statusCheckRollup: {
						contexts: {
							nodes: [
								{
									__typename: "CheckRun",
									name: "build",
									conclusion: "SUCCESS",
									detailsUrl: "https://example.test/run",
									status: "COMPLETED",
									startedAt: null,
									completedAt: null,
									checkSuite: { workflowRun: { databaseId: 1 } },
								},
							],
						},
					},
				},
			},
		}));

		const contexts = await fetchPullRequestChecks(octokit, {
			owner: "o",
			name: "r",
			number: 7,
		});

		expect(calls).toHaveLength(1);
		expect(calls[0]?.query).toContain("statusCheckRollup");
		expect(calls[0]?.variables).toEqual({ owner: "o", repo: "r", number: 7 });
		expect(contexts).toHaveLength(1);
		expect(contexts[0]).toMatchObject({
			__typename: "CheckRun",
			name: "build",
			conclusion: "SUCCESS",
		});
	});

	test("fetchPullRequestChecks returns [] when GitHub omits the rollup", async () => {
		const { octokit } = makeFakeOctokit(() => ({
			repository: { pullRequest: { statusCheckRollup: null } },
		}));

		const contexts = await fetchPullRequestChecks(octokit, {
			owner: "o",
			name: "r",
			number: 7,
		});

		expect(contexts).toEqual([]);
	});
});
