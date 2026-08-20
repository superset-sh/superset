/** Mirrors the backend's `viewerRelationshipSchema` in search-pull-requests.ts.
 *  No combined "reviewing" value: GitHub's search API rejects qualifier-level
 *  OR, so the Reviewing tab renders two grouped sections instead of one flat
 *  query — see PullRequestsReviewingContent. */
export type ViewerRelationship = "needs-review" | "reviewed" | "authored";

export const PULL_REQUESTS_VIEW_TABS = [
	{ value: "all", label: "All" },
	{ value: "reviewing", label: "Reviewing" },
	{ value: "authored", label: "Authored" },
] as const;

export type PullRequestsViewTab =
	(typeof PULL_REQUESTS_VIEW_TABS)[number]["value"];

export function normalizePullRequestsViewTab(
	value: unknown,
): PullRequestsViewTab {
	if (typeof value !== "string") return "all";
	return (
		PULL_REQUESTS_VIEW_TABS.find((tab) => tab.value === value)?.value ?? "all"
	);
}

/** The flat Authored tab has one unambiguous qualifier; Reviewing renders as
 *  two grouped sections instead (see PullRequestsReviewingContent) and All
 *  isn't restricted at all. */
export function viewerRelationshipForTab(
	tab: PullRequestsViewTab,
): ViewerRelationship | undefined {
	return tab === "authored" ? "authored" : undefined;
}
