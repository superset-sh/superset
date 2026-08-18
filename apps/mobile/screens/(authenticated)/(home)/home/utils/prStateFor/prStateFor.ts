import type { SelectGithubPullRequest } from "@superset/db/schema";

export type PrBadgeState = "closed" | "draft" | "merged" | "open";

export function prStateFor(pullRequest: SelectGithubPullRequest): PrBadgeState {
	if (pullRequest.mergedAt != null) return "merged";
	if (pullRequest.isDraft) return "draft";
	if (pullRequest.state === "closed") return "closed";
	return "open";
}
