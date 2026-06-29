import { describe, expect, test } from "bun:test";
import {
	deriveDisplayReviewState,
	parseGitLabReviewState,
} from "./deriveDisplayReviewState";

// ---------------------------------------------------------------------------
// GitHub variant
// ---------------------------------------------------------------------------
describe("deriveDisplayReviewState — github variant", () => {
	test('APPROVED → "approved"', () => {
		const json = JSON.stringify({
			provider: "github",
			reviewDecision: "APPROVED",
		});
		expect(deriveDisplayReviewState(json, null)).toBe("approved");
	});

	test('CHANGES_REQUESTED → "changes_requested"', () => {
		const json = JSON.stringify({
			provider: "github",
			reviewDecision: "CHANGES_REQUESTED",
		});
		expect(deriveDisplayReviewState(json, null)).toBe("changes_requested");
	});

	test('REVIEW_REQUIRED → "pending"', () => {
		const json = JSON.stringify({
			provider: "github",
			reviewDecision: "REVIEW_REQUIRED",
		});
		expect(deriveDisplayReviewState(json, null)).toBe("pending");
	});

	test("null reviewDecision in github variant → pending", () => {
		const json = JSON.stringify({ provider: "github", reviewDecision: null });
		expect(deriveDisplayReviewState(json, null)).toBe("pending");
	});
});

// ---------------------------------------------------------------------------
// GitLab variant
// ---------------------------------------------------------------------------
describe("deriveDisplayReviewState — gitlab variant", () => {
	const gitlabBase = {
		provider: "gitlab" as const,
		approvedBy: [],
		blockingDiscussionsResolved: true,
		hasConflicts: false,
	};

	test('requested_changes detailedMergeStatus → "changes_requested"', () => {
		const json = JSON.stringify({
			...gitlabBase,
			detailedMergeStatus: "requested_changes",
			approvalsRequired: 2,
			approvalsLeft: 1,
		});
		expect(deriveDisplayReviewState(json, null)).toBe("changes_requested");
	});

	test("approvalsLeft 0 + approvalsRequired > 0 → approved", () => {
		const json = JSON.stringify({
			...gitlabBase,
			detailedMergeStatus: "mergeable",
			approvalsRequired: 1,
			approvalsLeft: 0,
		});
		expect(deriveDisplayReviewState(json, null)).toBe("approved");
	});

	test("approvalsLeft 0 + approvalsRequired 0 (not required) → pending (not approved)", () => {
		const json = JSON.stringify({
			...gitlabBase,
			detailedMergeStatus: "mergeable",
			approvalsRequired: 0,
			approvalsLeft: 0,
		});
		// approvalsRequired must be > 0 for the approved path
		expect(deriveDisplayReviewState(json, null)).toBe("pending");
	});

	test("no requested_changes + approvalsLeft > 0 → pending", () => {
		const json = JSON.stringify({
			...gitlabBase,
			detailedMergeStatus: "mergeable",
			approvalsRequired: 2,
			approvalsLeft: 1,
		});
		expect(deriveDisplayReviewState(json, null)).toBe("pending");
	});

	test("approvalsRequired null → pending (cannot be approved)", () => {
		const json = JSON.stringify({
			...gitlabBase,
			detailedMergeStatus: "mergeable",
			approvalsRequired: null,
			approvalsLeft: null,
		});
		expect(deriveDisplayReviewState(json, null)).toBe("pending");
	});

	test("requested_changes takes precedence over approvalsLeft = 0", () => {
		const json = JSON.stringify({
			...gitlabBase,
			detailedMergeStatus: "requested_changes",
			approvalsRequired: 1,
			approvalsLeft: 0,
		});
		expect(deriveDisplayReviewState(json, null)).toBe("changes_requested");
	});
});

// ---------------------------------------------------------------------------
// Legacy fallback (reviewStateJson = null)
// ---------------------------------------------------------------------------
describe("deriveDisplayReviewState — legacy fallback parity", () => {
	// These assertions prove deriveDisplayReviewState(null, legacy) produces the
	// SAME output as the old normalizeReviewDecision(legacy) did.
	test('legacy "approved" → approved', () => {
		expect(deriveDisplayReviewState(null, "approved")).toBe("approved");
	});

	test('legacy "changes_requested" → changes_requested', () => {
		expect(deriveDisplayReviewState(null, "changes_requested")).toBe(
			"changes_requested",
		);
	});

	test("legacy null → pending", () => {
		expect(deriveDisplayReviewState(null, null)).toBe("pending");
	});

	test("legacy unknown string → pending", () => {
		expect(deriveDisplayReviewState(null, "REVIEW_REQUIRED")).toBe("pending");
	});

	test("legacy empty string → pending", () => {
		expect(deriveDisplayReviewState(null, "")).toBe("pending");
	});
});

// ---------------------------------------------------------------------------
// Malformed JSON → legacy fallback
// ---------------------------------------------------------------------------
describe("deriveDisplayReviewState — malformed JSON fallback", () => {
	test("bad JSON falls back to legacy decision", () => {
		expect(deriveDisplayReviewState("{not valid json", "approved")).toBe(
			"approved",
		);
	});

	test("bad JSON + null legacy → pending", () => {
		expect(deriveDisplayReviewState("null", null)).toBe("pending");
	});

	test("empty string JSON → falls back to legacy", () => {
		expect(deriveDisplayReviewState("", "changes_requested")).toBe(
			"changes_requested",
		);
	});

	test("unknown provider falls back to legacy", () => {
		const json = JSON.stringify({
			provider: "bitbucket",
			reviewDecision: "APPROVED",
		});
		expect(deriveDisplayReviewState(json, "approved")).toBe("approved");
	});
});

// ---------------------------------------------------------------------------
// parseGitLabReviewState
// ---------------------------------------------------------------------------
describe("parseGitLabReviewState", () => {
	const gitlabJson = JSON.stringify({
		provider: "gitlab",
		detailedMergeStatus: "ci_must_pass",
		approvalsRequired: 2,
		approvalsLeft: 1,
		approvedBy: ["alice"],
		blockingDiscussionsResolved: false,
		hasConflicts: true,
	});

	test("returns parsed shape for gitlab variant", () => {
		const result = parseGitLabReviewState(gitlabJson);
		expect(result).toEqual({
			detailedMergeStatus: "ci_must_pass",
			approvalsRequired: 2,
			approvalsLeft: 1,
			approvedBy: ["alice"],
			blockingDiscussionsResolved: false,
			hasConflicts: true,
		});
	});

	test("returns null for github variant", () => {
		const json = JSON.stringify({
			provider: "github",
			reviewDecision: "APPROVED",
		});
		expect(parseGitLabReviewState(json)).toBeNull();
	});

	test("returns null for null input", () => {
		expect(parseGitLabReviewState(null)).toBeNull();
	});

	test("returns null for malformed JSON", () => {
		expect(parseGitLabReviewState("{bad")).toBeNull();
	});

	test("returns null for non-object JSON", () => {
		expect(parseGitLabReviewState('"string"')).toBeNull();
	});
});
