import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import {
	GitMerge,
	GitPullRequest,
	GitPullRequestClosed,
	GitPullRequestDraft,
	type LucideIcon,
} from "lucide-react-native";

/** GitHub spreads this across state, isDraft and mergeability; a badge needs one word. */
export type PullRequestStatus =
	| "draft"
	| "open"
	| "queued"
	| "merged"
	| "closed";

export const PULL_REQUEST_STATUS: Record<
	PullRequestStatus,
	{
		label: MessageDescriptor;
		ink: string;
		surface: string;
		icon: LucideIcon;
	}
> = {
	draft: {
		label: msg({ id: "mobile.pullRequest.status.draft", message: "Draft" }),
		ink: "text-muted-foreground",
		surface: "bg-secondary",
		icon: GitPullRequestDraft,
	},
	open: {
		label: msg({ id: "mobile.pullRequest.status.open", message: "Open" }),
		ink: "text-emerald-500",
		surface: "bg-green-500/15",
		icon: GitPullRequest,
	},
	queued: {
		label: msg({ id: "mobile.pullRequest.status.queued", message: "Queued" }),
		ink: "text-amber-500",
		surface: "bg-amber-500/15",
		icon: GitPullRequest,
	},
	merged: {
		label: msg({ id: "mobile.pullRequest.status.merged", message: "Merged" }),
		ink: "text-purple-500",
		surface: "bg-violet-500/15",
		icon: GitMerge,
	},
	closed: {
		label: msg({ id: "mobile.pullRequest.status.closed", message: "Closed" }),
		ink: "text-destructive",
		surface: "bg-red-500/15",
		icon: GitPullRequestClosed,
	},
};

/** Accepts the synced row or the host detail; both carry these three fields. */
export function pullRequestStatus(
	pullRequest: { state: string; isDraft: boolean; mergedAt: Date | null },
	queued = false,
): PullRequestStatus {
	if (pullRequest.mergedAt || pullRequest.state === "merged") return "merged";
	if (pullRequest.state === "closed") return "closed";
	if (pullRequest.isDraft) return "draft";
	// The host history rows carry "queued" as a state; the detail path derives
	// it from mergeability and passes the flag instead.
	return queued || pullRequest.state === "queued" ? "queued" : "open";
}
