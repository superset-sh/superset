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
