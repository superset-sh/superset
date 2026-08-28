import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { i18n } from "@superset/i18n";

export const PULL_REQUEST_REVIEW_FILTERS = [
	{
		value: "none",
		label: msg({
			id: "dashboard.pullRequests.reviewFilter.none",
			message: "No reviews",
		}),
	},
	{
		value: "required",
		label: msg({
			id: "dashboard.pullRequests.reviewFilter.required",
			message: "Review required",
		}),
	},
	{
		value: "approved",
		label: msg({
			id: "dashboard.pullRequests.reviewFilter.approved",
			message: "Approved review",
		}),
	},
	{
		value: "changes-requested",
		label: msg({
			id: "dashboard.pullRequests.reviewFilter.changesRequested",
			message: "Changes requested",
		}),
	},
	{
		value: "reviewed-by-me",
		label: msg({
			id: "dashboard.pullRequests.reviewFilter.reviewedByMe",
			message: "Reviewed by you",
		}),
	},
	{
		value: "not-reviewed-by-me",
		label: msg({
			id: "dashboard.pullRequests.reviewFilter.notReviewedByMe",
			message: "Not reviewed by you",
		}),
	},
	{
		value: "review-requested",
		label: msg({
			id: "dashboard.pullRequests.reviewFilter.reviewRequested",
			message: "Awaiting review from you",
		}),
	},
	{
		value: "team-review-requested",
		label: msg({
			id: "dashboard.pullRequests.reviewFilter.teamReviewRequested",
			message: "Awaiting review from you or your team",
		}),
	},
] as const satisfies ReadonlyArray<{
	value: string;
	label: MessageDescriptor;
}>;

const ALL_REVIEWS_LABEL: MessageDescriptor = msg({
	id: "dashboard.pullRequests.reviewFilter.allReviewsLabel",
	message: "All reviews",
});

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
	if (!value) return i18n._(ALL_REVIEWS_LABEL);
	const descriptor = PULL_REQUEST_REVIEW_FILTERS.find(
		(filter) => filter.value === value,
	)?.label;
	return i18n._(descriptor ?? ALL_REVIEWS_LABEL);
}
