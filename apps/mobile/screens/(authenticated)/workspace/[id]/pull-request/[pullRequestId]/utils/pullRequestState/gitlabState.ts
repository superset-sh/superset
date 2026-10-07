import type { GitlabPullRequestDetail } from "../../hooks/gitlabActionTarget";
import type { ActionId, PullRequestState } from "./pullRequestState";
export type GitLabState =
	| Exclude<PullRequestState, "queued" | "changes-requested">
	| "checking"
	| "locked"
	| "approval-unknown";
type Input = Pick<
	GitlabPullRequestDetail,
	"pullRequest" | "checks" | "reviewState" | "capabilities"
>;
export function resolveGitLabState({
	pullRequest,
	checks,
	reviewState,
}: Input): GitLabState {
	if (pullRequest.state === "merged") return "merged";
	if (pullRequest.state === "closed") return "closed";
	if (
		reviewState.state === "locked" ||
		reviewState.detailedMergeStatus === "locked"
	)
		return "locked";
	if (
		reviewState.hasConflicts ||
		reviewState.detailedMergeStatus === "conflict"
	)
		return "conflicts";
	if (
		checks.some(
			(check) =>
				check.status === "COMPLETED" &&
				check.conclusion !== null &&
				![
					"SUCCESS",
					"NEUTRAL",
					"SKIPPED",
					"CANCELLED",
					"CANCELED",
					"ACTION_REQUIRED",
					"STALE",
				].includes(check.conclusion),
		)
	)
		return "checks-failed";
	if (checks.some((check) => check.conclusion === "ACTION_REQUIRED"))
		return "check-needs-action";
	if (
		checks.some(
			(check) =>
				check.status !== "COMPLETED" ||
				check.conclusion === null ||
				check.conclusion === "STALE",
		)
	)
		return "waiting-for-checks";
	if (
		reviewState.detailedMergeStatus === "not_approved" ||
		(reviewState.approvalsLeft !== null && reviewState.approvalsLeft > 0)
	)
		return "waiting-for-review";
	if (
		!reviewState.blockingDiscussionsResolved ||
		reviewState.detailedMergeStatus === "discussions_not_resolved"
	)
		return "unresolved-conversations";
	if (
		["checking", "unchecked", "preparing", "approvals_syncing"].includes(
			reviewState.detailedMergeStatus,
		)
	)
		return "checking";
	if (
		["ci_still_running", "ci_must_pass", "status_checks_must_pass"].includes(
			reviewState.detailedMergeStatus,
		)
	)
		return "waiting-for-checks";
	if (reviewState.detailedMergeStatus === "mergeable") return "ready";
	if (
		reviewState.approvalsRequired === null ||
		reviewState.approvalsLeft === null
	)
		return "approval-unknown";
	return "blocked";
}
export function resolveGitLabActions(detail: Input): ActionId[] {
	const state = resolveGitLabState(detail);
	const { capabilities, pullRequest } = detail;
	if (state === "merged" || state === "locked") return [];
	if (state === "closed") return capabilities.reopen ? ["reopen"] : [];
	if (pullRequest.isDraft)
		return [
			...(capabilities.markReady ? ["mark-ready" as const] : []),
			...(state === "checks-failed" ? ["ask-fix-checks" as const] : []),
		];
	const actions: ActionId[] = [];
	if (state === "ready" && capabilities.merge) actions.push("merge");
	if (state === "conflicts") actions.push("ask-resolve-conflicts");
	if (state === "checks-failed") actions.push("ask-fix-checks");
	if (state === "unresolved-conversations")
		actions.push("ask-address-comments");
	if (capabilities.updateBranch) actions.push("update-branch");
	return actions;
}
