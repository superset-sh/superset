import { describe, expect, test } from "bun:test";
import type { ExecGlab } from "../../../../trpc/router/workspace-creation/utils/exec-glab";
import {
	fetchJobLogsFromGlab,
	fetchOpenPullRequestsFromGlab,
	fetchPullRequestByHeadFromGlab,
	fetchPullRequestChecksFromGlab,
	fetchPullRequestReviewDecisionFromGlab,
	mergePullRequestFromGlab,
} from "./gitlab-query";

const REPOSITORY = { owner: "acme", name: "app" };

function fakeGlab(response: unknown) {
	const calls: Array<{ args: string[]; cwd?: string; maxBuffer?: number }> = [];
	const execGlab: ExecGlab = async (args, options) => {
		calls.push({ args, cwd: options?.cwd, maxBuffer: options?.maxBuffer });
		return response;
	};
	return { calls, execGlab };
}

describe("GitLab merge request queries", () => {
	test("normalizes a merge request found by source branch", async () => {
		const { calls, execGlab } = fakeGlab([
			{
				iid: 42,
				title: "Add GitLab review support",
				web_url: "https://gitlab.com/acme/app/-/merge_requests/42",
				state: "opened",
				draft: false,
				source_branch: "feat/gitlab",
				sha: "abc123",
				updated_at: "2026-08-21T10:00:00Z",
			},
		]);

		const result = await fetchPullRequestByHeadFromGlab(
			execGlab,
			REPOSITORY,
			{ owner: "acme", repo: "app", branch: "feat/gitlab" },
			"/repo",
		);

		expect(result).toMatchObject({
			number: 42,
			state: "OPEN",
			headRefName: "feat/gitlab",
			headRefOid: "abc123",
		});
		expect(calls[0]?.cwd).toBe("/repo");
		expect(calls[0]?.args).toContain("projects/acme%2Fapp/merge_requests");
		expect(calls[0]?.args).toContain("source_branch=feat/gitlab");
	});

	test("filters merge requests from forked source projects", async () => {
		const { execGlab } = fakeGlab([
			{
				iid: 1,
				title: "Forked request",
				web_url: "https://gitlab.example.com/acme/app/-/merge_requests/1",
				state: "opened",
				source_branch: "feat/fork",
				sha: "fork-sha",
				source_project_id: 99,
				target_project_id: 10,
			},
			{
				iid: 2,
				title: "Same project request",
				web_url: "https://gitlab.example.com/acme/app/-/merge_requests/2",
				state: "opened",
				source_branch: "feat/same",
				sha: "same-sha",
				source_project_id: 10,
				target_project_id: 10,
			},
		]);

		const result = await fetchOpenPullRequestsFromGlab(
			execGlab,
			REPOSITORY,
			"/repo",
		);

		expect(result).toHaveLength(1);
		expect(result[0]?.number).toBe(2);
	});

	test("maps approvals to the shared review decision", async () => {
		const { execGlab } = fakeGlab({
			approved: true,
			approved_by: [{ user: { username: "reviewer" } }],
		});
		expect(
			await fetchPullRequestReviewDecisionFromGlab(
				execGlab,
				REPOSITORY,
				42,
				"OPEN",
				"/repo",
			),
		).toBe("APPROVED");
	});

	test("does not treat optional approvals as an actual approval", async () => {
		const { execGlab } = fakeGlab({
			approved: true,
			approvals_required: 0,
			approvals_left: 0,
			approved_by: [],
		});
		expect(
			await fetchPullRequestReviewDecisionFromGlab(
				execGlab,
				REPOSITORY,
				42,
				"OPEN",
				"/repo",
			),
		).toBe("REVIEW_REQUIRED");
	});

	test("normalizes GitLab commit statuses as checks", async () => {
		const { execGlab } = fakeGlab([
			{ name: "test", status: "success", target_url: "https://ci/test" },
			{ name: "lint", status: "running", target_url: "https://ci/lint" },
		]);
		const result = await fetchPullRequestChecksFromGlab(
			execGlab,
			REPOSITORY,
			"abc123",
			"/repo",
		);
		expect(result).toMatchObject([
			{ name: "test", status: "COMPLETED", conclusion: "SUCCESS" },
			{ name: "lint", status: "IN_PROGRESS", conclusion: null },
		]);
	});

	test.each([
		["merge", []],
		["squash", ["--squash"]],
		["rebase", ["--rebase"]],
	] as const)("maps the %s merge mode to glab", async (mergeMethod, flags) => {
		const { calls, execGlab } = fakeGlab("");
		await mergePullRequestFromGlab(
			execGlab,
			REPOSITORY,
			42,
			mergeMethod,
			"/repo",
		);

		expect(calls).toEqual([
			{
				args: [
					"mr",
					"merge",
					"42",
					"--repo",
					"acme/app",
					"--auto-merge=false",
					"--yes",
					...flags,
				],
				cwd: "/repo",
			},
		]);
	});

	test("allows large GitLab job traces", async () => {
		const { calls, execGlab } = fakeGlab("large trace");
		await fetchJobLogsFromGlab(execGlab, REPOSITORY, 7, "/repo");

		expect(calls[0]?.maxBuffer).toBe(50 * 1024 * 1024);
	});
});
