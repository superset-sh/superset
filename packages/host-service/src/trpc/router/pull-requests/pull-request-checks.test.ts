import { describe, expect, test } from "bun:test";
import { normalizePullRequestChecks } from "./pull-request-checks";

describe("normalizePullRequestChecks", () => {
	test("normalizes check runs and legacy status contexts", () => {
		const result = normalizePullRequestChecks([
			{
				__typename: "CheckRun",
				name: "Typecheck",
				status: "COMPLETED",
				conclusion: "SUCCESS",
				detailsUrl: "https://github.com/org/repo/actions/runs/1",
			},
			{
				__typename: "StatusContext",
				context: "Deploy preview",
				state: "PENDING",
				targetUrl: "https://example.test/deploy",
			},
		]);

		expect(result.checks).toEqual([
			{
				name: "Typecheck",
				status: "success",
				url: "https://github.com/org/repo/actions/runs/1",
			},
			{
				name: "Deploy preview",
				status: "pending",
				url: "https://example.test/deploy",
			},
		]);
		expect(result.checksStatus).toBe("pending");
	});

	test("normalizes REST-derived contexts from the Octokit fallback", () => {
		// Shape produced by github-query's fetchPullRequestChecks (REST →
		// GraphQL-node conversion): uppercased status/conclusion, checkSuite null.
		const result = normalizePullRequestChecks([
			{
				__typename: "CheckRun",
				name: "Build",
				status: "COMPLETED",
				conclusion: "FAILURE",
				detailsUrl: "https://github.com/org/repo/runs/5",
				startedAt: null,
				completedAt: null,
				checkSuite: null,
			},
			{
				__typename: "StatusContext",
				context: "lint",
				state: "SUCCESS",
				targetUrl: null,
				createdAt: null,
			},
		]);

		expect(result.checks).toEqual([
			{
				name: "Build",
				status: "failure",
				url: "https://github.com/org/repo/runs/5",
			},
			{ name: "lint", status: "success", url: null },
		]);
		expect(result.checksStatus).toBe("failure");
	});

	test("treats an absent rollup as no checks", () => {
		expect(normalizePullRequestChecks(undefined)).toEqual({
			checks: [],
			checksStatus: "none",
		});
		expect(normalizePullRequestChecks(null)).toEqual({
			checks: [],
			checksStatus: "none",
		});
	});
});
