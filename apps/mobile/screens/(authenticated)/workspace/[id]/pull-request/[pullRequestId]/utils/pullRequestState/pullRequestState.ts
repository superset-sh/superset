// Imported from the concrete modules, not the barrel: status.ts pulls in
// lucide-react-native, which bun test cannot load.
import { effectiveCheckStatus } from "../../../../utils/pullRequest/checks";
import type {
	PullRequest,
	PullRequestCapabilities,
	PullRequestDetail,
	PullRequestMergeability,
	PullRequestReviewer,
} from "../../../../utils/pullRequest/types";

export type PullRequestState =
	| "merged"
	| "closed"
	| "queued"
	| "conflicts"
	| "checks-failed"
	| "check-needs-action"
	| "waiting-for-checks"
	| "changes-requested"
	| "waiting-for-review"
	| "unresolved-conversations"
	| "blocked"
	| "ready";

/** What the pull request is waiting on, first blocker first; actions are resolved separately. */
export function resolvePullRequestState({
	pullRequest,
	checks,
	reviewers,
	mergeability,
}: PullRequestDetail): PullRequestState {
	if (pullRequest.mergedAt !== null || pullRequest.state === "merged") {
		return "merged";
	}
	if (pullRequest.state === "closed") return "closed";
	if (mergeability.queue) return "queued";
	if (
		mergeability.mergeStateStatus === "DIRTY" ||
		mergeability.mergeable === "CONFLICTING"
	) {
		return "conflicts";
	}

	const required = checks.filter((check) => check.isRequired);
	const graded = (required.length > 0 ? required : checks).map(
		effectiveCheckStatus,
	);
	if (graded.includes("failed")) return "checks-failed";
	if (graded.includes("needs-action")) return "check-needs-action";
	if (graded.includes("running")) return "waiting-for-checks";

	if (
		reviewers.some((reviewer) => reviewer.state === "CHANGES_REQUESTED") ||
		mergeability.reviewDecision === "CHANGES_REQUESTED"
	) {
		return "changes-requested";
	}
	// reviewDecision also covers rulesets, which report requiredApprovals as 0.
	if (
		!pullRequest.isDraft &&
		(mergeability.reviewDecision === "REVIEW_REQUIRED" ||
			mergeability.approvals < mergeability.requiredApprovals)
	) {
		return "waiting-for-review";
	}
	if (
		mergeability.requiresThreadResolution &&
		mergeability.unresolvedThreads > 0
	) {
		return "unresolved-conversations";
	}
	if (mergeability.mergeStateStatus === "BLOCKED") return "blocked";
	return "ready";
}

export type ActionId =
	| "merge"
	| "mark-ready"
	| "update-branch"
	| "reopen"
	| "dequeue"
	| "ask-resolve-conflicts"
	| "ask-fix-checks"
	| "ask-address-comments";

export function actionEmphasis(action: ActionId): "merge" | "agent" | "plain" {
	if (action === "merge") return "merge";
	return action.startsWith("ask-") ? "agent" : "plain";
}

const MERGE_REFUSED: PullRequestState[] = [
	"conflicts",
	"waiting-for-review",
	"blocked",
];

export function resolveActions(
	state: PullRequestState,
	{
		pullRequest,
		capabilities,
	}: {
		pullRequest: PullRequest;
		capabilities: PullRequestCapabilities;
	},
): ActionId[] {
	if (state === "merged") return [];
	if (state === "closed") return capabilities.reopen ? ["reopen"] : [];
	if (state === "queued") return capabilities.dequeue ? ["dequeue"] : [];

	if (pullRequest.isDraft) {
		const actions: ActionId[] = capabilities.markReady ? ["mark-ready"] : [];
		// Failing checks are fixable before the draft goes out; every other blocker waits for Mark Ready.
		if (state === "checks-failed") actions.push("ask-fix-checks");
		return actions;
	}

	const actions: ActionId[] = [];
	// Merge stays offered through running or failed checks; conflicts, a missing review or branch rules remove it.
	if (capabilities.merge && !MERGE_REFUSED.includes(state)) {
		actions.push("merge");
	}

	if (state === "conflicts") actions.push("ask-resolve-conflicts");
	else if (state === "checks-failed") actions.push("ask-fix-checks");
	else if (
		state === "changes-requested" ||
		state === "unresolved-conversations"
	) {
		actions.push("ask-address-comments");
	}

	if (capabilities.updateBranch) actions.push("update-branch");
	return actions;
}

/** GitHub computes mergeability lazily; briefly after a push it is simply unknown. */
export function isMergeabilityPending(
	mergeability: PullRequestMergeability,
): boolean {
	return (
		mergeability.mergeable === "UNKNOWN" ||
		mergeability.mergeStateStatus === "UNKNOWN"
	);
}

function showsReviewers(
	reviewers: PullRequestReviewer[],
	mergeability: PullRequestMergeability,
): boolean {
	return (
		reviewers.length > 0 ||
		mergeability.requiredApprovals > 0 ||
		mergeability.reviewDecision === "REVIEW_REQUIRED"
	);
}

export type CardRowId = "checks" | "reviewers" | "merged-by";

/**
 * Which rows the card shows, top to bottom. A merged pull request keeps only
 * its receipt and a closed one drops every status row — checks and reviewers
 * only matter while the pull request is still going somewhere.
 */
export function resolveCardRows(
	state: PullRequestState,
	{ pullRequest, checks, reviewers, mergeability }: PullRequestDetail,
): CardRowId[] {
	if (state === "merged") return pullRequest.mergedBy ? ["merged-by"] : [];
	if (state === "closed") return [];

	const rows: CardRowId[] = [];
	if (checks.length > 0) rows.push("checks");
	if (showsReviewers(reviewers, mergeability)) rows.push("reviewers");
	return rows;
}
