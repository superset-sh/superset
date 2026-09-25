/** Normalized PR shape used by review tab UI components. */
export interface NormalizedPR {
	number: number;
	url: string;
	title: string;
	state: "open" | "closed" | "merged" | "draft" | "queued";
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

export type { NormalizedComment } from "../../../CommentsSection/types";
