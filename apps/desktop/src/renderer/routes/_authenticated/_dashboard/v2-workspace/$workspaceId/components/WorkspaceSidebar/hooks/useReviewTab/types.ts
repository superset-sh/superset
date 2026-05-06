/** Normalized PR shape used by review tab UI components. */
export interface NormalizedPR {
	number: number;
	url: string;
	title: string;
	state: "open" | "closed" | "merged" | "draft";
	reviewDecision: "approved" | "changes_requested" | "pending";
	checksStatus: "success" | "failure" | "pending" | "none";
	checks: NormalizedCheck[];
}

export interface NormalizedCheck {
	name: string;
	status: "success" | "failure" | "pending" | "skipped" | "cancelled";
	url?: string;
	durationText?: string;
}

/** Normalized comment shape, flattened from review threads + conversation comments. */
export interface NormalizedComment {
	id: string;
	authorLogin: string;
	avatarUrl?: string;
	body: string;
	createdAt?: string;
	url?: string;
	kind: "review" | "conversation";
	path?: string;
	line?: number;
	isResolved: boolean;
	threadId?: string;
}
