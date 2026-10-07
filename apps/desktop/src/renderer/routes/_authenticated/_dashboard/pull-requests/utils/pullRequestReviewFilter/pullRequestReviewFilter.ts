import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { i18n } from "@superset/i18n";
import type { HostServiceClient } from "renderer/lib/host-service-client";

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
	selection?: PullRequestSearchSelection,
): string {
	if (!value) return i18n._(ALL_REVIEWS_LABEL);
	const descriptor = getPullRequestReviewFilterOptions(selection).find(
		(filter) => filter.value === value,
	)?.label;
	return i18n._(
		descriptor ??
			PULL_REQUEST_REVIEW_FILTERS.find((filter) => filter.value === value)
				?.label ??
			ALL_REVIEWS_LABEL,
	);
}

export interface PullRequestSearchSelection {
	mode: "github" | "gitlab" | "mixed" | "unknown";
	ready: boolean;
	hasGitlab: boolean;
	approvalRules: boolean;
	error?: string;
}

type SearchCapability = Awaited<
	ReturnType<
		HostServiceClient["workspaceCreation"]["getPullRequestSearchCapabilities"]["query"]
	>
>[number];

export function getPullRequestSearchSelection(
	capabilities: readonly SearchCapability[],
	expected: number,
	pending: boolean,
	error?: string,
): PullRequestSearchSelection {
	const hasGitlab = capabilities.some((item) => item.provider === "gitlab");
	const hasGithub = capabilities.some((item) => item.provider === "github");
	const ready =
		!pending &&
		!error &&
		capabilities.length === expected &&
		new Set(capabilities.map((item) => item.projectId)).size === expected &&
		capabilities.every((item) => item.provider !== null);
	return {
		mode: !ready
			? "unknown"
			: hasGitlab
				? hasGithub
					? "mixed"
					: "gitlab"
				: "github",
		ready,
		hasGitlab,
		approvalRules:
			ready && capabilities.every((item) => item.approvalRules === "available"),
		error: error ?? capabilities.find((item) => item.error)?.error?.message,
	};
}

const NATIVE_REVIEW_LABELS: Partial<
	Record<PullRequestReviewFilter, MessageDescriptor>
> = {
	none: msg({ message: "No completed reviews or approvals" }),
	required: msg({ message: "Pending reviews or unmet approval rules" }),
	approved: msg({ message: "Approved with all approval rules met" }),
	"reviewed-by-me": msg({
		message: "Reviewed by you in the current review cycle",
	}),
	"not-reviewed-by-me": msg({
		message: "Not reviewed by you in the current review cycle",
	}),
	"review-requested": msg({ message: "Awaiting your current review" }),
};

export function getPullRequestReviewFilterOptions(
	selection?: PullRequestSearchSelection,
): {
	value: PullRequestReviewFilter;
	label: MessageDescriptor;
	disabled: boolean;
	reason?: MessageDescriptor;
}[] {
	return PULL_REQUEST_REVIEW_FILTERS.filter(
		(filter) =>
			selection?.mode !== "gitlab" || filter.value !== "team-review-requested",
	).map((filter) => {
		const nativeTeam =
			selection?.hasGitlab && filter.value === "team-review-requested";
		const needsRules =
			selection?.hasGitlab &&
			(filter.value === "required" || filter.value === "approved") &&
			!selection.approvalRules;
		const pending = selection !== undefined && !selection.ready;
		return {
			...filter,
			label:
				selection?.mode === "gitlab"
					? (NATIVE_REVIEW_LABELS[filter.value] ?? filter.label)
					: filter.label,
			disabled: !!(pending || nativeTeam || needsRules),
			reason: pending
				? msg({
						message: "Repository search capabilities are not available yet.",
					})
				: nativeTeam
					? msg({
							message:
								"Team review requests are unavailable for selected GitLab projects.",
						})
					: needsRules
						? msg({
								message:
									"GitLab approval-rule filters require an available approval rules API.",
							})
						: undefined,
		};
	});
}
