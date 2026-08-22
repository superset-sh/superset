import { describe, expect, test } from "bun:test";
import {
	coercePullRequestState,
	computeChecksStatus,
	mapPullRequestState,
	type PullRequestCheck,
} from "./pull-request-mappers";

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

function check(status: PullRequestCheck["status"]): PullRequestCheck {
	return { name: status, status, url: null };
}

describe("computeChecksStatus", () => {
	test("no checks is none", () => {
		expect(computeChecksStatus([])).toBe("none");
	});

	test("a cancelled check is a failure, not a success", () => {
		expect(computeChecksStatus([check("cancelled")])).toBe("failure");
		expect(computeChecksStatus([check("success"), check("cancelled")])).toBe(
			"failure",
		);
	});

	test("failure beats pending and cancelled", () => {
		expect(
			computeChecksStatus([
				check("pending"),
				check("cancelled"),
				check("failure"),
			]),
		).toBe("failure");
	});

	test("cancelled beats pending even with no explicit failure present", () => {
		expect(computeChecksStatus([check("pending"), check("cancelled")])).toBe(
			"failure",
		);
	});

	test("pending beats success and skipped", () => {
		expect(
			computeChecksStatus([
				check("success"),
				check("skipped"),
				check("pending"),
			]),
		).toBe("pending");
	});

	test("all success (or skipped) is success", () => {
		expect(computeChecksStatus([check("success"), check("skipped")])).toBe(
			"success",
		);
	});
});
