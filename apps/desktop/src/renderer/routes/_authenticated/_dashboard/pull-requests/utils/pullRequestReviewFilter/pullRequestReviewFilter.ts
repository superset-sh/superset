export const PULL_REQUEST_REVIEW_FILTERS = [
	{ value: "none", label: "No reviews" },
	{ value: "required", label: "Review required" },
	{ value: "approved", label: "Approved review" },
	{ value: "changes-requested", label: "Changes requested" },
	{ value: "reviewed-by-me", label: "Reviewed by you" },
	{ value: "not-reviewed-by-me", label: "Not reviewed by you" },
	{ value: "review-requested", label: "Awaiting review from you" },
	{
		value: "team-review-requested",
		label: "Awaiting review from you or your team",
	},
] as const;

export type PullRequestReviewFilter =
	(typeof PULL_REQUEST_REVIEW_FILTERS)[number]["value"];

export function normalizePullRequestReviewFilter(
	value: unknown,
): PullRequestReviewFilter | null {
	if (typeof value !== "string") return null;
	return (
		PULL_REQUEST_REVIEW_FILTERS.find((filter) => filter.value === value)
			?.value ?? null
	);
}

export function getPullRequestReviewFilterLabel(
	value: PullRequestReviewFilter | null,
): string {
	if (!value) return "All reviews";
	return (
		PULL_REQUEST_REVIEW_FILTERS.find((filter) => filter.value === value)
			?.label ?? "All reviews"
	);
}
