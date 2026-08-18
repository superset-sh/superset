import { describe, expect, test } from "bun:test";
import {
	coercePullRequestState,
	computeChecksStatus,
	mapPullRequestState,
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

describe("computeChecksStatus", () => {
	test("a cancelled check must not roll up to success", () => {
		// Regression test for #5667: a cancelled CI run is terminal and did not
		// pass, so it must not surface a green "success" indicator.
		expect(
			computeChecksStatus([
				{ name: "ci/build", status: "cancelled", url: null },
			]),
		).not.toBe("success");
	});

	test("a cancelled check rolls up to failure", () => {
		expect(
			computeChecksStatus([
				{ name: "ci/build", status: "cancelled", url: null },
			]),
		).toBe("failure");
	});

	test("failure and pending still take precedence over cancelled", () => {
		expect(
			computeChecksStatus([
				{ name: "a", status: "cancelled", url: null },
				{ name: "b", status: "failure", url: null },
			]),
		).toBe("failure");
	});

	test("skipped and neutral remain non-blocking", () => {
		expect(
			computeChecksStatus([
				{ name: "a", status: "success", url: null },
				{ name: "b", status: "skipped", url: null },
			]),
		).toBe("success");
	});

	test("no checks is none", () => {
		expect(computeChecksStatus([])).toBe("none");
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
