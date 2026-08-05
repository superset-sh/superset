import { describe, expect, test } from "bun:test";
import type { PullRequest } from "../getPRFlowState";
import { coerceCheckStatus, computeChecksRollup } from "./computeChecksStatus";

type CheckRun = PullRequest["checks"][number];

function check(
	status: string,
	conclusion: CheckRun["conclusion"] = null,
): CheckRun {
	return {
		name: `check-${status}-${conclusion ?? "none"}`,
		status: status as CheckRun["status"],
		conclusion,
		detailsUrl: null,
		startedAt: null,
		completedAt: null,
	};
}

describe("coerceCheckStatus", () => {
	test("passes through already-effective statuses", () => {
		expect(coerceCheckStatus("cancelled", null)).toBe("cancelled");
		expect(coerceCheckStatus("failure", null)).toBe("failure");
	});

	test("resolves raw status/conclusion pairs", () => {
		expect(coerceCheckStatus("in_progress", null)).toBe("pending");
		expect(coerceCheckStatus("completed", null)).toBe("pending");
		expect(coerceCheckStatus("completed", "cancelled")).toBe("cancelled");
		expect(coerceCheckStatus("completed", "action_required")).toBe("failure");
	});
});

describe("computeChecksRollup", () => {
	test("returns none when no relevant checks exist", () => {
		expect(computeChecksRollup([]).overall).toBe("none");
		expect(computeChecksRollup([check("skipped")]).overall).toBe("none");
	});

	test("a cancelled check rolls up as failure, not success", () => {
		const rollup = computeChecksRollup([check("success"), check("cancelled")]);
		expect(rollup.overall).toBe("failure");
		expect(rollup.failureCount).toBe(1);
		expect(rollup.relevantCount).toBe(2);
	});

	test("a raw completed/cancelled check rolls up as failure", () => {
		expect(computeChecksRollup([check("completed", "cancelled")]).overall).toBe(
			"failure",
		);
	});

	test("cancelled takes precedence over pending", () => {
		expect(
			computeChecksRollup([check("in_progress"), check("cancelled")]).overall,
		).toBe("failure");
	});

	test("pending wins when nothing failed", () => {
		expect(
			computeChecksRollup([check("success"), check("in_progress")]).overall,
		).toBe("pending");
	});

	test("skipped checks stay excluded from the rollup", () => {
		const rollup = computeChecksRollup([check("success"), check("skipped")]);
		expect(rollup.overall).toBe("success");
		expect(rollup.relevantCount).toBe(1);
	});
});
