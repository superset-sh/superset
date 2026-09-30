import {
	parseRepositoryRemote,
	type RepositoryIdentity,
} from "./source-control";

/** The one vocabulary every surface renders a pull request from. */

export type PullRequestState = "open" | "closed" | "merged";
export type PullRequestCheckStatus =
	| "success"
	| "failure"
	| "pending"
	| "skipped"
	| "cancelled";
export type PullRequestChecksStatus =
	| "success"
	| "failure"
	| "pending"
	| "none";
export type PullRequestReviewDecision =
	| "approved"
	| "changes_requested"
	| "pending"
	| null;

export interface PullRequestCheck {
	name: string;
	status: PullRequestCheckStatus;
	url: string | null;
}

/** A pull request by its own identity, with what a detail view renders. */
export interface PullRequestDetail {
	identity?: RepositoryIdentity;
	repoFullName: string;
	number: number;
	url: string;
	title: string;
	body: string;
	state: PullRequestState;
	isDraft: boolean;
	author: { login: string; avatarUrl: string | null } | null;
	head: {
		ref: string;
		/** Null when the head repository is unknown or gone (a deleted fork). */
		repoFullName: string | null;
	};
	base: { ref: string };
	reviewDecision: PullRequestReviewDecision;
	checksStatus: PullRequestChecksStatus;
	checks: PullRequestCheck[];
	createdAt: string;
	updatedAt: string;
}

export function normalizePullRequestIdentity(
	detail: Pick<PullRequestDetail, "identity" | "repoFullName">,
): RepositoryIdentity {
	if (detail.identity) return detail.identity;
	const parsed = parseRepositoryRemote(
		`https://github.com/${detail.repoFullName}`,
	);
	if (!parsed) throw new Error("Invalid GitHub repository identity");
	return parsed;
}
