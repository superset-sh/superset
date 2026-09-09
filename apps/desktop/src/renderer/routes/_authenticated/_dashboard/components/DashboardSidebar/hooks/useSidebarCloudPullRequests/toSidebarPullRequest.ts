import type { RouterOutputs } from "@superset/trpc";
import type {
	DashboardSidebarWorkspacePullRequest,
	DashboardSidebarWorkspacePullRequestCheck,
} from "../../types";

export type CloudPullRequestRow =
	RouterOutputs["integration"]["github"]["getByBranches"]["pullRequests"][number];

function toCheckStatus(check: {
	status: string;
	conclusion: string | null;
}): DashboardSidebarWorkspacePullRequestCheck["status"] {
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

function toReviewDecision(
	value: string | null,
): DashboardSidebarWorkspacePullRequest["reviewDecision"] {
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

function toChecksStatus(
	value: string,
): DashboardSidebarWorkspacePullRequest["checksStatus"] {
	return value === "success" || value === "failure" || value === "pending"
		? value
		: "none";
}

/** The host's chip shape; `queued` (merge queue) is host-only, so it shows as open here. */
export function toSidebarPullRequest(
	row: CloudPullRequestRow,
): DashboardSidebarWorkspacePullRequest {
	const state =
		row.state === "merged" || row.mergedAt
			? "merged"
			: row.state === "closed"
				? "closed"
				: row.isDraft
					? "draft"
					: "open";
	return {
		url: row.url,
		number: row.number,
		title: row.title,
		state,
		reviewDecision: toReviewDecision(row.reviewDecision),
		checksStatus: toChecksStatus(row.checksStatus),
		checks: row.checks.map((check) => ({
			name: check.name,
			status: toCheckStatus(check),
			url: check.detailsUrl ?? null,
		})),
	};
}
