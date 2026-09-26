import type { RouterOutputs } from "@superset/trpc";
import type { DashboardSidebarWorkspacePullRequest } from "../../types";

export type CloudPullRequestRow =
	RouterOutputs["integration"]["github"]["getByBranches"]["pullRequests"][number];

/** The host's chip shape; `queued` (merge queue) is host-only, so it shows as open here. */
export function toSidebarPullRequest(
	row: CloudPullRequestRow,
): DashboardSidebarWorkspacePullRequest {
	return {
		url: row.url,
		number: row.number,
		title: row.title,
		state: row.state === "open" && row.isDraft ? "draft" : row.state,
		reviewDecision: row.reviewDecision,
		checksStatus: row.checksStatus,
		checks: row.checks,
	};
}
