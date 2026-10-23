import { describe, expect, test } from "bun:test";
import { PullRequestReadError } from "../pull-request-detail";
import { githubErrorCode, pullRequestOnGithub } from "./pull-request-github";

function recordingClient(responses: Record<string, unknown> = {}) {
	const calls: [string, unknown][] = [];
	return {
		calls,
		client: {
			graphql: async <T>(query: string, variables: Record<string, unknown>) => {
				calls.push([
					query.includes("pullRequest(number") ? "node-id" : "graphql",
					variables,
				]);
				return { repository: { pullRequest: { id: "PR_node" } } } as T;
			},
			request: async (route: string, parameters?: Record<string, unknown>) => {
				calls.push([route, parameters]);
				return { data: responses[route] ?? {} };
			},
		},
	};
}

const pr = { owner: "acme", repo: "widgets", number: 7 };

describe("pullRequestOnGithub", () => {
	test("writes go to GitHub's own endpoints for the one pull request", async () => {
		const { client, calls } = recordingClient({
			"POST /repos/{owner}/{repo}/issues/{issue_number}/comments": {
				id: 1,
				html_url: "https://github.com/acme/widgets/pull/7#issuecomment-1",
			},
		});
		const github = pullRequestOnGithub(client, pr);
		expect(await github.comment("hi")).toEqual({
			id: 1,
			url: "https://github.com/acme/widgets/pull/7#issuecomment-1",
		});
		await github.merge({ mergeMethod: "squash" });
		await github.setState("closed");
		await github.setDraft(true);
		expect(calls).toEqual([
			[
				"POST /repos/{owner}/{repo}/issues/{issue_number}/comments",
				{ owner: "acme", repo: "widgets", issue_number: 7, body: "hi" },
			],
			[
				"PUT /repos/{owner}/{repo}/pulls/{pull_number}/merge",
				{
					owner: "acme",
					repo: "widgets",
					pull_number: 7,
					merge_method: "squash",
				},
			],
			[
				"PATCH /repos/{owner}/{repo}/pulls/{pull_number}",
				{ owner: "acme", repo: "widgets", pull_number: 7, state: "closed" },
			],
			["node-id", { owner: "acme", name: "widgets", number: 7 }],
			["graphql", { id: "PR_node" }],
		]);
	});

	test("a failed threads read is reported, not mistaken for no comments", async () => {
		const github = pullRequestOnGithub(
			{
				graphql: async () => {
					throw new Error("rate limited");
				},
				request: async () => ({ data: {} }),
			},
			pr,
		);
		expect(await github.threads()).toEqual({
			reviewThreads: [],
			fetchFailed: true,
		});
	});
});

test("GitHub's answers map to the codes clients branch on", () => {
	expect(githubErrorCode({ status: 405 })).toBe("CONFLICT");
	expect(githubErrorCode({ status: 404 })).toBe("NOT_FOUND");
	expect(githubErrorCode({ errors: [{ type: "FORBIDDEN" }] })).toBe(
		"FORBIDDEN",
	);
	expect(githubErrorCode({ errors: [{ message: "already a draft" }] })).toBe(
		"BAD_REQUEST",
	);
	expect(githubErrorCode(new PullRequestReadError("NOT_FOUND", "gone"))).toBe(
		"NOT_FOUND",
	);
	expect(githubErrorCode(new Error("boom"))).toBe("INTERNAL_SERVER_ERROR");
});
