import { describe, expect, test } from "bun:test";
import {
	getPullRequestReviewFilterLabel,
	normalizePullRequestReviewFilter,
} from "./pullRequestReviewFilter";

describe("pullRequestReviewFilter", () => {
	test("normalizes supported review filters", () => {
		expect(normalizePullRequestReviewFilter("approved")).toBe("approved");
		expect(normalizePullRequestReviewFilter("team-review-requested")).toBe(
			"team-review-requested",
		);
	});

	test("rejects unsupported filters and labels the default", () => {
		expect(normalizePullRequestReviewFilter("review:approved")).toBeNull();
		expect(normalizePullRequestReviewFilter(null)).toBeNull();
		expect(getPullRequestReviewFilterLabel(null)).toBe("All reviews");
		expect(getPullRequestReviewFilterLabel("changes-requested")).toBe(
			"Changes requested",
		);
	});
});
