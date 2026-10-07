import { describe, expect, test } from "bun:test";
import type { PullRequest } from "../getPRFlowState";
import { computeChecksRollup } from "./computeChecksStatus";

type CheckRun = PullRequest["checks"][number];

// The DB stores the already-resolved effective status ("success"/"cancelled"/
// etc.) in `status`, even though the tRPC type narrows it to the raw GitHub
// CheckStatusState — see coerceCheckStatus's own doc comment. Cast to match
// what real data actually looks like on the wire.
function check(effectiveStatus: string): CheckRun {
	return {
		name: effectiveStatus,
		status: effectiveStatus as CheckRun["status"],
		conclusion: null,
		detailsUrl: null,
		startedAt: null,
		completedAt: null,
	};
}

describe("computeChecksRollup", () => {
	test("no checks is none", () => {
		expect(computeChecksRollup([]).overall).toBe("none");
	});

	test("a cancelled check is a failure, not a silent no-op", () => {
		const rollup = computeChecksRollup([check("success"), check("cancelled")]);
		expect(rollup.overall).toBe("failure");
		expect(rollup.failureCount).toBe(1);
		expect(rollup.relevantCount).toBe(2);
	});

	test("only cancelled checks reports failure, not none", () => {
		const rollup = computeChecksRollup([check("cancelled")]);
		expect(rollup.overall).toBe("failure");
		expect(rollup.relevantCount).toBe(1);
	});

	test("skipped checks are still excluded from the rollup", () => {
		const rollup = computeChecksRollup([check("success"), check("skipped")]);
		expect(rollup.overall).toBe("success");
		expect(rollup.relevantCount).toBe(1);
	});

	test("only skipped checks is none, not success", () => {
		const rollup = computeChecksRollup([check("skipped")]);
		expect(rollup.overall).toBe("none");
		expect(rollup.relevantCount).toBe(0);
	});

	test("failure beats pending and cancelled", () => {
		const rollup = computeChecksRollup([
			check("pending"),
			check("cancelled"),
			check("failure"),
		]);
		expect(rollup.overall).toBe("failure");
	});

	test("pending beats success", () => {
		const rollup = computeChecksRollup([check("success"), check("pending")]);
		expect(rollup.overall).toBe("pending");
	});

	test("all success is success", () => {
		const rollup = computeChecksRollup([check("success"), check("success")]);
		expect(rollup.overall).toBe("success");
	});
});
