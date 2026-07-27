import { describe, expect, test } from "bun:test";
import {
	coercePullRequestState,
	computeChecksStatus,
	mapPullRequestState,
	type PullRequestCheck,
} from "./pull-request-mappers";

function check(status: PullRequestCheck["status"]): PullRequestCheck {
	return { name: `check-${status}`, status, url: null };
}

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

describe("computeChecksStatus", () => {
	test("returns none for an empty list", () => {
		expect(computeChecksStatus([])).toBe("none");
	});

	test("a single cancelled check rolls up as failure, not success", () => {
		expect(computeChecksStatus([check("cancelled")])).toBe("failure");
	});

	test("a cancelled check among successes rolls up as failure", () => {
		expect(computeChecksStatus([check("success"), check("cancelled")])).toBe(
			"failure",
		);
	});

	test("failure takes precedence over pending", () => {
		expect(computeChecksStatus([check("pending"), check("failure")])).toBe(
			"failure",
		);
	});

	test("pending wins when nothing failed", () => {
		expect(computeChecksStatus([check("success"), check("pending")])).toBe(
			"pending",
		);
	});

	test("skipped checks stay non-blocking and fold into success", () => {
		expect(computeChecksStatus([check("success"), check("skipped")])).toBe(
			"success",
		);
		expect(computeChecksStatus([check("skipped")])).toBe("success");
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
