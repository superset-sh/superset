import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { i18n } from "@superset/i18n";

export const PULL_REQUEST_REVIEW_FILTERS = [
	{
		value: "none",
		label: msg({
			message: "No reviews",
		}),
	},
	{
		value: "required",
		label: msg({
			message: "Review required",
		}),
	},
	{
		value: "approved",
		label: msg({
			message: "Approved review",
		}),
	},
	{
		value: "changes-requested",
		label: msg({
			message: "Changes requested",
		}),
	},
	{
		value: "reviewed-by-me",
		label: msg({
			message: "Reviewed by you",
		}),
	},
	{
		value: "not-reviewed-by-me",
		label: msg({
			message: "Not reviewed by you",
		}),
	},
	{
		value: "review-requested",
		label: msg({
			message: "Awaiting review from you",
		}),
	},
	{
		value: "team-review-requested",
		label: msg({
			message: "Awaiting review from you or your team",
		}),
	},
] as const satisfies ReadonlyArray<{
	value: string;
	label: MessageDescriptor;
}>;

const ALL_REVIEWS_LABEL: MessageDescriptor = msg({
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
