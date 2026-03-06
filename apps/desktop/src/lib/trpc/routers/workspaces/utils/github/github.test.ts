import { describe, expect, test } from "bun:test";
import { mapReviewDecision } from "./github";

// Regression test for issue #1796:
// https://github.com/SupersetAI/superset/issues/1796
//
// GitHub's REVIEW_REQUIRED state means "a reviewer has been explicitly
// requested but hasn't responded yet". This is a distinct workflow state
// from "pending" (which means no review has been requested at all).
//
// Currently both map to "pending", making it impossible to distinguish
// "waiting for reviewer" from "no review activity", which prevents the
// sidebar from showing useful PR workflow status to both authors and reviewers.

describe("mapReviewDecision", () => {
	test("APPROVED maps to approved", () => {
		expect(mapReviewDecision("APPROVED")).toBe("approved");
	});

	test("CHANGES_REQUESTED maps to changes_requested", () => {
		expect(mapReviewDecision("CHANGES_REQUESTED")).toBe("changes_requested");
	});

	test("null (no review activity) maps to pending", () => {
		expect(mapReviewDecision(null)).toBe("pending");
	});

	test("empty string (no review activity) maps to pending", () => {
		expect(mapReviewDecision("")).toBe("pending");
	});

	test("REVIEW_REQUIRED maps to review_required, not pending", () => {
		// Bug: REVIEW_REQUIRED currently falls through to "pending", losing
		// the distinction between "reviewer has been requested" and "no review yet".
		// This prevents showing the reviewer-needs-to-act state in the sidebar.
		expect(mapReviewDecision("REVIEW_REQUIRED")).toBe("review_required");
	});

	test("REVIEW_REQUIRED is distinguishable from no review activity", () => {
		// Both currently return "pending", but they represent different states:
		// - null/"": nobody has been asked to review
		// - REVIEW_REQUIRED: someone has been specifically asked to review
		const reviewRequested = mapReviewDecision("REVIEW_REQUIRED");
		const noReviewActivity = mapReviewDecision(null);
		expect(reviewRequested).not.toBe(noReviewActivity);
	});
});
