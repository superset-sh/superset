/**
 * Pure derive helper for the review-tab badge state (spec §6.1).
 *
 * The host-service stores a provider-discriminated JSON blob in
 * `reviewStateJson`. This module parses that blob and maps it to the same
 * 3-state the UI badge has always used, keeping the GitHub path identical to
 * the previous `normalizeReviewDecision` behaviour.
 */

// ---------------------------------------------------------------------------
// Local type mirrors (NormalizedReviewState is NOT exported from host-service)
// ---------------------------------------------------------------------------

type GitHubReviewUnion = {
	provider: "github";
	reviewDecision: string | null;
};

type GitLabReviewUnion = {
	provider: "gitlab";
	detailedMergeStatus: string;
	approvalsRequired: number | null;
	approvalsLeft: number | null;
	approvedBy: string[];
	blockingDiscussionsResolved: boolean;
	hasConflicts: boolean;
};

type NormalizedReviewUnion = GitHubReviewUnion | GitLabReviewUnion;

// ---------------------------------------------------------------------------
// Public: GitLab state extractor (returns null for non-gitlab or bad input)
// ---------------------------------------------------------------------------

export interface GitLabReviewState {
	detailedMergeStatus: string;
	approvalsRequired: number | null;
	approvalsLeft: number | null;
	approvedBy: string[];
	blockingDiscussionsResolved: boolean;
	hasConflicts: boolean;
}

/**
 * Parses `reviewStateJson` and returns the GitLab-specific fields, or `null`
 * if the json is absent, malformed, or belongs to a non-gitlab provider.
 */
export function parseGitLabReviewState(
	reviewStateJson: string | null,
): GitLabReviewState | null {
	const union = parseUnion(reviewStateJson);
	if (!union || union.provider !== "gitlab") return null;
	const g = union as GitLabReviewUnion;
	return {
		detailedMergeStatus: g.detailedMergeStatus,
		approvalsRequired: g.approvalsRequired,
		approvalsLeft: g.approvalsLeft,
		approvedBy: g.approvedBy,
		blockingDiscussionsResolved: g.blockingDiscussionsResolved,
		hasConflicts: g.hasConflicts,
	};
}

// ---------------------------------------------------------------------------
// Public: primary derive function
// ---------------------------------------------------------------------------

/**
 * Returns the same 3-state the review-tab badge has always displayed.
 *
 * - If `reviewStateJson` is present and valid, use it (provider-specific logic).
 * - Otherwise fall back to `legacyReviewDecision` (identical to the old
 *   `normalizeReviewDecision` function).
 *
 * The GitHub path is provably identical to the previous behaviour for every
 * possible legacy value (see parity tests).
 */
export function deriveDisplayReviewState(
	reviewStateJson: string | null,
	legacyReviewDecision: string | null,
): "approved" | "changes_requested" | "pending" {
	const union = parseUnion(reviewStateJson);
	if (!union) return legacyDecision(legacyReviewDecision);

	if (union.provider === "github") {
		return githubDecision((union as GitHubReviewUnion).reviewDecision);
	}

	if (union.provider === "gitlab") {
		const g = union as GitLabReviewUnion;
		if (g.detailedMergeStatus === "requested_changes")
			return "changes_requested";
		if (
			g.approvalsRequired != null &&
			g.approvalsRequired > 0 &&
			g.approvalsLeft === 0
		)
			return "approved";
		return "pending";
	}

	// Unknown provider — fall back to legacy
	return legacyDecision(legacyReviewDecision);
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

/** JSON.parse guarded — returns null on bad input or non-object values. */
function parseUnion(
	reviewStateJson: string | null,
): NormalizedReviewUnion | null {
	if (!reviewStateJson) return null;
	try {
		const parsed: unknown = JSON.parse(reviewStateJson);
		if (
			typeof parsed !== "object" ||
			parsed === null ||
			!("provider" in parsed)
		) {
			return null;
		}
		return parsed as NormalizedReviewUnion;
	} catch {
		return null;
	}
}

/**
 * Maps the raw GitHub enum to the 3-state.
 * Identical mapping to the old `normalizeReviewDecision` for github values.
 */
function githubDecision(
	reviewDecision: string | null,
): "approved" | "changes_requested" | "pending" {
	if (reviewDecision === "APPROVED") return "approved";
	if (reviewDecision === "CHANGES_REQUESTED") return "changes_requested";
	return "pending";
}

/**
 * Legacy fallback — identical to the old `normalizeReviewDecision(decision)`.
 * Kept as a named function so parity tests can verify it exactly.
 */
function legacyDecision(
	decision: string | null,
): "approved" | "changes_requested" | "pending" {
	if (decision === "approved") return "approved";
	if (decision === "changes_requested") return "changes_requested";
	return "pending";
}
