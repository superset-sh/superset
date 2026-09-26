/** Builds the shared pull-request vocabulary once from the webhook row. */
import type {
	PullRequestCheck,
	PullRequestCheckStatus,
	PullRequestChecksStatus,
	PullRequestReviewDecision,
	PullRequestState,
} from "@superset/shared/pull-request";

export type { PullRequestDetail } from "@superset/shared/pull-request";

type StoredCheck = {
	name: string;
	status: string;
	conclusion: string | null;
	detailsUrl?: string;
};

export function toPullRequestState(
	state: string,
	mergedAt: Date | string | null,
): PullRequestState {
	if (state === "merged" || mergedAt) return "merged";
	return state === "closed" ? "closed" : "open";
}

export function toReviewDecision(
	value: string | null,
): PullRequestReviewDecision {
	switch (value) {
		case "APPROVED":
			return "approved";
		case "CHANGES_REQUESTED":
			return "changes_requested";
		case "REVIEW_REQUIRED":
			return "pending";
		default:
			return null;
	}
}

export function toChecksStatus(value: string): PullRequestChecksStatus {
	return value === "success" || value === "failure" || value === "pending"
		? value
		: "none";
}

function toCheckStatus(check: StoredCheck): PullRequestCheckStatus {
	if (check.status.toLowerCase() !== "completed") return "pending";
	switch (check.conclusion?.toLowerCase()) {
		case "success":
			return "success";
		case "skipped":
		case "neutral":
			return "skipped";
		case "cancelled":
			return "cancelled";
		case null:
		case undefined:
			return "pending";
		default:
			return "failure";
	}
}

export function toChecks(checks: StoredCheck[] | null): PullRequestCheck[] {
	return (checks ?? []).map((check) => ({
		name: check.name,
		status: toCheckStatus(check),
		url: check.detailsUrl ?? null,
	}));
}
