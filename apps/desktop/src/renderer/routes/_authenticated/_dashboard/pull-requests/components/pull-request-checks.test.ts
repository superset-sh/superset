import { describe, expect, test } from "bun:test";
import { summarizePullRequestChecks } from "./pull-request-checks";

describe("summarizePullRequestChecks", () => {
	test("excludes skipped and cancelled checks from the required summary", () => {
		const result = summarizePullRequestChecks([
			{ name: "Skipped", status: "skipped", url: null },
			{ name: "Cancelled", status: "cancelled", url: null },
		]);
		expect(result.status).toBe("none");
		expect(result.relevantChecks).toEqual([]);
	});

	test("prioritizes failures over pending and successful checks", () => {
		const result = summarizePullRequestChecks([
			{ name: "Passed", status: "success", url: null },
			{ name: "Running", status: "pending", url: null },
			{ name: "Failed", status: "failure", url: null },
		]);
		expect(result).toMatchObject({
			status: "failure",
			passing: 1,
			pending: 1,
			failing: 1,
		});
	});
});
