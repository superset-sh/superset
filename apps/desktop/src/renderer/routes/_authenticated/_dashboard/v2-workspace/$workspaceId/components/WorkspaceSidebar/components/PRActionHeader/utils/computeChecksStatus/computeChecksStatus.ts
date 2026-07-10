import type { PullRequest } from "../getPRFlowState";

type CheckRun = PullRequest["checks"][number];

/** Effective per-check status after collapsing GitHub's status × conclusion grid. */
export type EffectiveCheckStatus =
	| "success"
	| "failure"
	| "pending"
	| "skipped"
	| "cancelled";

const KNOWN_EFFECTIVE_STATUSES = new Set<string>([
	"success",
	"failure",
	"pending",
	"skipped",
	"cancelled",
]);

/**
 * Resolves a check's effective status. The host-service DB stores the already-
 * resolved effective status (e.g. "success") in `status`, but the tRPC router
 * types `status` as `CheckStatusState` ("completed"/"in_progress"/etc.) and
 * leaves `conclusion` null. So we first try to read `status` as effective; if
 * it isn't one of those, fall back to status+conclusion logic for raw GitHub
 * data.
 */
export function coerceCheckStatus(
	status: CheckRun["status"] | string,
	conclusion: CheckRun["conclusion"],
): EffectiveCheckStatus {
	if (KNOWN_EFFECTIVE_STATUSES.has(status))
		return status as EffectiveCheckStatus;
	if (status !== "completed") return "pending";
	if (!conclusion) return "pending";
	if (conclusion === "success" || conclusion === "neutral") return "success";
	if (conclusion === "skipped") return "skipped";
	if (conclusion === "cancelled") return "cancelled";
	return "failure";
}

export type ChecksRollup = {
	overall: "success" | "failure" | "pending" | "none";
	successCount: number;
	failureCount: number;
	pendingCount: number;
	relevantCount: number;
};

/** Roll up an array of check runs into a single overall status + counts. */
export function computeChecksRollup(checks: CheckRun[]): ChecksRollup {
	let successCount = 0;
	let failureCount = 0;
	let pendingCount = 0;
	for (const c of checks) {
		const s = coerceCheckStatus(c.status, c.conclusion);
		if (s === "skipped" || s === "cancelled") continue;
		if (s === "success") successCount++;
		else if (s === "failure") failureCount++;
		else pendingCount++;
	}
	const relevantCount = successCount + failureCount + pendingCount;
	let overall: ChecksRollup["overall"];
	if (relevantCount === 0) overall = "none";
	else if (failureCount > 0) overall = "failure";
	else if (pendingCount > 0) overall = "pending";
	else overall = "success";
	return {
		overall,
		successCount,
		failureCount,
		pendingCount,
		relevantCount,
	};
}
