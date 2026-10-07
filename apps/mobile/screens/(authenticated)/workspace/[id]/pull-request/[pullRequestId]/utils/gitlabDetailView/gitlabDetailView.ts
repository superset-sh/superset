import type {
	CheckConclusion,
	PullRequest,
	PullRequestCheck,
	PullRequestReviewer,
} from "../../../../utils/pullRequest/types";
import type { GitlabPullRequestDetail } from "../../hooks/gitlabActionTarget";

function date(value: string | null): Date | null {
	if (!value) return null;
	const result = new Date(value);
	return Number.isFinite(result.getTime()) ? result : null;
}
function conclusion(value: string | null): CheckConclusion | null | undefined {
	switch (value) {
		case null:
			return null;
		case "SUCCESS":
		case "NEUTRAL":
		case "SKIPPED":
		case "CANCELLED":
		case "FAILURE":
		case "TIMED_OUT":
		case "STARTUP_FAILURE":
		case "ACTION_REQUIRED":
		case "STALE":
			return value;
		case "CANCELED":
			return "CANCELLED";
		default:
			return undefined;
	}
}
function browserUrl(value: string | null) {
	if (!value) return null;
	try {
		const url = new URL(value);
		return url.protocol === "https:" && !url.username && !url.password
			? value
			: null;
	} catch {
		return null;
	}
}
export function gitlabDetailView(detail: GitlabPullRequestDetail): {
	pullRequest: PullRequest;
	checks: PullRequestCheck[];
	reviewers: PullRequestReviewer[];
} | null {
	const state = detail.pullRequest.state;
	if (state !== "open" && state !== "closed" && state !== "merged") return null;
	const checks: PullRequestCheck[] = [];
	for (const check of detail.checks) {
		const status = check.status;
		const result = conclusion(check.conclusion);
		if (
			(status !== "COMPLETED" && status !== "IN_PROGRESS") ||
			result === undefined
		)
			return null;
		checks.push({
			...check,
			status,
			conclusion: result,
			startedAt: date(check.startedAt),
			completedAt: date(check.completedAt),
			detailsUrl: browserUrl(check.detailsUrl),
		});
	}
	const reviewers: PullRequestReviewer[] = [];
	for (const reviewer of detail.reviewers) {
		const state = reviewer.state;
		if (reviewer.isTeam || (state !== "APPROVED" && state !== "REQUESTED"))
			return null;
		reviewers.push({ ...reviewer, isTeam: false, state });
	}
	return {
		pullRequest: {
			...detail.pullRequest,
			state,
			mergedAt: date(detail.pullRequest.mergedAt),
		},
		checks,
		reviewers,
	};
}
export type GitlabDetailView = NonNullable<ReturnType<typeof gitlabDetailView>>;
