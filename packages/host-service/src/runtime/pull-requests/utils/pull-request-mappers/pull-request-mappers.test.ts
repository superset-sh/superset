import { describe, expect, test } from "bun:test";
import type { GitHubCheckContextNode } from "../github-query";
import {
	coercePullRequestState,
	computeChecksStatus,
	mapPullRequestState,
	type PullRequestCheck,
	parseCheckContexts,
} from "./pull-request-mappers";

function check(status: PullRequestCheck["status"]): PullRequestCheck {
	return { name: `check-${status}`, status, url: null };
}

function checkRunNode(
	conclusion: string | null,
	status = "COMPLETED",
): GitHubCheckContextNode {
	return {
		__typename: "CheckRun",
		name: `run-${conclusion ?? status}`,
		conclusion,
		detailsUrl: null,
		status,
		startedAt: null,
		completedAt: null,
		checkSuite: null,
	};
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

	test("cancelled takes precedence over pending", () => {
		expect(computeChecksStatus([check("pending"), check("cancelled")])).toBe(
			"failure",
		);
	});

	test("skipped checks stay non-blocking and fold into success", () => {
		expect(computeChecksStatus([check("success"), check("skipped")])).toBe(
			"success",
		);
		expect(computeChecksStatus([check("skipped")])).toBe("success");
	});
});

describe("parseCheckContexts", () => {
	test("maps terminal check-run conclusions to their effective status", () => {
		const statuses = parseCheckContexts([
			checkRunNode("CANCELLED"),
			checkRunNode("ACTION_REQUIRED"),
			checkRunNode("STARTUP_FAILURE"),
			checkRunNode("SKIPPED"),
		]).map((check) => check.status);

		expect(statuses).toEqual(["cancelled", "failure", "failure", "skipped"]);
	});

	test("keeps a completed run without a conclusion pending", () => {
		expect(parseCheckContexts([checkRunNode(null)])[0]?.status).toBe("pending");
		expect(
			parseCheckContexts([checkRunNode(null, "IN_PROGRESS")])[0]?.status,
		).toBe("pending");
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
