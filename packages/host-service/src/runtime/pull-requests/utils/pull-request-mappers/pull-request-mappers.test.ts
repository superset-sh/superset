import { describe, expect, test } from "bun:test";
import {
	coercePullRequestState,
	computeChecksStatus,
	mapPullRequestState,
	type PullRequestCheck,
} from "./pull-request-mappers";

const check = (status: PullRequestCheck["status"]): PullRequestCheck => ({
	name: `check-${status}`,
	status,
	url: null,
});

describe("mapPullRequestState", () => {
	test("maps merged and closed states regardless of other flags", () => {
		expect(mapPullRequestState("MERGED", false, true)).toBe("merged");
		expect(mapPullRequestState("CLOSED", true, true)).toBe("closed");
	});

	test("draft trumps merge-queue membership", () => {
		expect(mapPullRequestState("OPEN", true, true)).toBe("draft");
	});

	test("an open PR in the merge queue is queued", () => {
		expect(mapPullRequestState("OPEN", false, true)).toBe("queued");
	});

	test("an open PR not in the queue stays open", () => {
		expect(mapPullRequestState("OPEN", false, false)).toBe("open");
		expect(mapPullRequestState("OPEN", false)).toBe("open");
	});
});

describe("coercePullRequestState", () => {
	test("round-trips the queued state", () => {
		expect(coercePullRequestState("queued")).toBe("queued");
	});

	test("falls back to open for unknown values", () => {
		expect(coercePullRequestState("nonsense")).toBe("open");
		expect(coercePullRequestState(null)).toBe("open");
	});
});

describe("computeChecksStatus", () => {
	test("returns 'none' when there are no checks", () => {
		expect(computeChecksStatus([])).toBe("none");
	});

	test("returns 'success' when all checks succeed", () => {
		expect(computeChecksStatus([check("success"), check("success")])).toBe(
			"success",
		);
	});

	test("returns 'failure' when any check failed", () => {
		expect(computeChecksStatus([check("success"), check("failure")])).toBe(
			"failure",
		);
	});

	test("returns 'pending' when a check is still running and none failed", () => {
		expect(computeChecksStatus([check("success"), check("pending")])).toBe(
			"pending",
		);
	});

	// Regression: a cancelled run is terminal and did not pass, so it must not
	// roll up to a green 'success'.
	test("treats a cancelled check as a non-passing status, not success", () => {
		expect(computeChecksStatus([check("cancelled")])).toBe("failure");
		expect(computeChecksStatus([check("success"), check("cancelled")])).toBe(
			"failure",
		);
	});

	test("cancelled/failure outrank a concurrent pending check", () => {
		expect(computeChecksStatus([check("pending"), check("cancelled")])).toBe(
			"failure",
		);
	});

	// `skipped` (GitHub SKIPPED/NEUTRAL) is intentionally non-blocking.
	test("keeps skipped checks non-blocking (folds into success)", () => {
		expect(computeChecksStatus([check("success"), check("skipped")])).toBe(
			"success",
		);
		expect(computeChecksStatus([check("skipped")])).toBe("success");
	});
});
