import type { PullRequestMergeability } from "../../hooks/usePullRequestDetail";

export type PullRequestMergeStatus =
	| { tone: "muted"; kind: "merged" | "closed" | "draft" | "unknown" }
	| { tone: "success"; kind: "mergeable" }
	| { tone: "conflict"; kind: "conflicting"; baseBranch: string };

/** The Merge status line of the detail's info column, from what GitHub reports. */
export function describePullRequestMergeStatus(detail: {
	state: "open" | "closed" | "merged";
	isDraft: boolean;
	mergeability?: PullRequestMergeability;
	baseBranch: string;
}): PullRequestMergeStatus {
	if (detail.state === "merged") return { tone: "muted", kind: "merged" };
	if (detail.state === "closed") return { tone: "muted", kind: "closed" };
	if (detail.isDraft) return { tone: "muted", kind: "draft" };
	if (detail.mergeability === "conflicting") {
		return {
			tone: "conflict",
			kind: "conflicting",
			baseBranch: detail.baseBranch,
		};
	}
	if (detail.mergeability === "mergeable") {
		return { tone: "success", kind: "mergeable" };
	}
	return { tone: "muted", kind: "unknown" };
}
