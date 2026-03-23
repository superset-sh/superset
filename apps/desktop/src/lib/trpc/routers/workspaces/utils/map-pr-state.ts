import type { GitHubStatus } from "@superset/local-db";

export type PRCategory =
	| "draft"
	| "in-review"
	| "approved"
	| "merged"
	| "closed"
	| "no-pr";

export function categorizePR(status: GitHubStatus): PRCategory {
	if (!status.pr) return "no-pr";
	if (status.pr.state === "open" && status.pr.reviewDecision === "approved") {
		return "approved";
	}
	switch (status.pr.state) {
		case "draft":
			return "draft";
		case "open":
			return "in-review";
		case "merged":
			return "merged";
		case "closed":
			return "closed";
		default:
			return "no-pr";
	}
}
