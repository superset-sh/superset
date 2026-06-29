import type { NormalizedReviewState } from "@superset/db/schema";

import type { GitLabApprovals, GitLabMergeRequest } from "./client";

/**
 * Pure mapping helpers (no env/db) shared by the poll sync and the webhook handler.
 * Kept separate so the §6 review-state logic — the no-reduction core — is unit-tested
 * directly without loading the API runtime.
 */

/** GitLab MR state → our widened pull_requests.state (draft folded in when open). */
export function mapState(state: string, draft: boolean | undefined): string {
	const base = state === "opened" ? "open" : state; // closed | merged | locked
	return base === "open" && draft ? "draft" : base;
}

/** GitLab pipeline status → the existing checks rollup enum (none|pending|success|failure). */
export function mapPipelineStatus(status: string | undefined): string {
	if (!status) return "none";
	if (status === "success") return "success";
	if (status === "failed") return "failure";
	if (
		status === "running" ||
		status === "pending" ||
		status === "created" ||
		status === "preparing" ||
		status === "waiting_for_resource" ||
		status === "scheduled"
	) {
		return "pending";
	}
	return "none"; // canceled | skipped | manual
}

/**
 * Builds the §6 review union from a full MR + its approvals — facts stored verbatim,
 * no reduction. Absent fields become null/empty ("unknown"), never inferred.
 */
export function buildReviewState(
	mr: GitLabMergeRequest,
	approvals: GitLabApprovals | null,
): NormalizedReviewState {
	return {
		provider: "gitlab",
		detailedMergeStatus: mr.detailed_merge_status ?? "",
		approvalsRequired: approvals?.approvals_required ?? null,
		approvalsLeft: approvals?.approvals_left ?? null,
		approvedBy: (approvals?.approved_by ?? []).map((a) => a.user.username),
		blockingDiscussionsResolved: mr.blocking_discussions_resolved ?? false,
		hasConflicts: mr.has_conflicts ?? false,
	};
}
