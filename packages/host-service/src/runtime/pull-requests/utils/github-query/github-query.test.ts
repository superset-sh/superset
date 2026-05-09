import { describe, expect, test } from "bun:test";
import {
	fetchPullRequestByHeadFromGh,
	fetchPullRequestChecksFromGh,
	fetchPullRequestReviewDecisionFromGh,
} from "./github-query";

interface GhCall {
	args: string[];
}

function createExecGh(responses: unknown[]) {
	const calls: GhCall[] = [];
	const execGh = async (args: string[]) => {
		calls.push({ args });
		const response = responses.shift();
		if (response instanceof Error) throw response;
		return response;
	};

	return { calls, execGh };
}

describe("GitHub pull request REST queries", () => {
	test("fetches only the PR matching the requested upstream head", async () => {
		const { calls, execGh } = createExecGh([
			[
				{
					number: 42,
					title: "Fix sidebar",
					html_url: "https://github.com/superset-sh/superset/pull/42",
					state: "open",
					draft: false,
					merged_at: null,
					updated_at: "2026-05-08T12:00:00Z",
					head: {
						ref: "fix/sidebar",
						sha: "abc123",
						repo: {
							name: "superset",
							owner: { login: "superset-sh" },
						},
					},
					base: {
						repo: {
							full_name: "superset-sh/superset",
						},
					},
				},
			],
		]);

		const result = await fetchPullRequestByHeadFromGh(
			execGh,
			{ owner: "superset-sh", name: "superset" },
			{ owner: "superset-sh", repo: "superset", branch: "fix/sidebar" },
		);

		expect(result).toEqual({
			number: 42,
			title: "Fix sidebar",
			url: "https://github.com/superset-sh/superset/pull/42",
			state: "OPEN",
			isDraft: false,
			headRefName: "fix/sidebar",
			headRefOid: "abc123",
			isCrossRepository: false,
			headRepositoryOwner: { login: "superset-sh" },
			headRepository: { name: "superset" },
			updatedAt: "2026-05-08T12:00:00Z",
		});
		expect(calls).toEqual([
			{
				args: [
					"api",
					"--method",
					"GET",
					"repos/superset-sh/superset/pulls",
					"-f",
					"state=all",
					"-f",
					"head=superset-sh:fix/sidebar",
					"-f",
					"sort=updated",
					"-f",
					"direction=desc",
					"-f",
					"per_page=10",
				],
			},
		]);
	});

	test("filters REST head candidates by exact upstream repository", async () => {
		const { execGh } = createExecGh([
			[
				{
					number: 41,
					title: "Wrong fork",
					html_url: "https://github.com/superset-sh/superset/pull/41",
					state: "open",
					draft: false,
					merged_at: null,
					updated_at: "2026-05-08T12:05:00Z",
					head: {
						ref: "fix/sidebar",
						sha: "wrong",
						repo: {
							name: "other-repo",
							owner: { login: "fork-owner" },
						},
					},
					base: {
						repo: {
							full_name: "superset-sh/superset",
						},
					},
				},
				{
					number: 42,
					title: "Right fork",
					html_url: "https://github.com/superset-sh/superset/pull/42",
					state: "open",
					draft: false,
					merged_at: null,
					updated_at: "2026-05-08T12:00:00Z",
					head: {
						ref: "fix/sidebar",
						sha: "abc123",
						repo: {
							name: "fork-repo",
							owner: { login: "Fork-Owner" },
						},
					},
					base: {
						repo: {
							full_name: "superset-sh/superset",
						},
					},
				},
			],
		]);

		const result = await fetchPullRequestByHeadFromGh(
			execGh,
			{ owner: "superset-sh", name: "superset" },
			{ owner: "fork-owner", repo: "fork-repo", branch: "fix/sidebar" },
		);

		expect(result?.number).toBe(42);
		expect(result?.headRepositoryOwner?.login).toBe("Fork-Owner");
		expect(result?.headRepository?.name).toBe("fork-repo");
	});

	test("derives review decision from latest REST reviews by author", async () => {
		const { calls, execGh } = createExecGh([
			[
				{
					user: { login: "a" },
					state: "APPROVED",
					submitted_at: "2026-05-08T12:00:00Z",
				},
				{
					user: { login: "a" },
					state: "CHANGES_REQUESTED",
					submitted_at: "2026-05-08T12:05:00Z",
				},
			],
		]);

		const result = await fetchPullRequestReviewDecisionFromGh(
			execGh,
			{ owner: "superset-sh", name: "superset" },
			42,
			"OPEN",
		);

		expect(result).toBe("CHANGES_REQUESTED");
		expect(calls).toEqual([
			{
				args: [
					"api",
					"--method",
					"GET",
					"repos/superset-sh/superset/pulls/42/reviews",
					"-f",
					"per_page=100",
				],
			},
		]);
	});

	test("keeps open PRs pending when no terminal review exists", async () => {
		const { execGh } = createExecGh([[]]);

		const result = await fetchPullRequestReviewDecisionFromGh(
			execGh,
			{ owner: "superset-sh", name: "superset" },
			42,
			"OPEN",
		);

		expect(result).toBe("REVIEW_REQUIRED");
	});

	test("fetches check runs and commit statuses for the matched PR head SHA", async () => {
		const { calls, execGh } = createExecGh([
			{
				check_runs: [
					{
						name: "Typecheck",
						conclusion: "success",
						details_url: "https://github.com/superset-sh/superset/actions/1",
						status: "completed",
						started_at: "2026-05-08T12:00:00Z",
						completed_at: "2026-05-08T12:03:00Z",
					},
				],
			},
			[
				{
					context: "CodeRabbit",
					state: "success",
					target_url: "https://coderabbit.ai",
					created_at: "2026-05-08T12:04:00Z",
				},
			],
		]);

		const result = await fetchPullRequestChecksFromGh(
			execGh,
			{ owner: "superset-sh", name: "superset" },
			"abc123",
		);

		expect(result).toEqual([
			{
				__typename: "CheckRun",
				name: "Typecheck",
				conclusion: "SUCCESS",
				detailsUrl: "https://github.com/superset-sh/superset/actions/1",
				status: "COMPLETED",
				startedAt: "2026-05-08T12:00:00Z",
				completedAt: "2026-05-08T12:03:00Z",
				checkSuite: null,
			},
			{
				__typename: "StatusContext",
				context: "CodeRabbit",
				state: "SUCCESS",
				targetUrl: "https://coderabbit.ai",
				createdAt: "2026-05-08T12:04:00Z",
			},
		]);
		expect(calls).toEqual([
			{
				args: [
					"api",
					"--method",
					"GET",
					"repos/superset-sh/superset/commits/abc123/check-runs",
					"-f",
					"per_page=100",
				],
			},
			{
				args: [
					"api",
					"--method",
					"GET",
					"repos/superset-sh/superset/commits/abc123/statuses",
					"-f",
					"per_page=100",
				],
			},
		]);
	});
});
