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
		label: msg({ message: "Draft" }),
		ink: "text-muted-foreground",
		surface: "bg-secondary",
		icon: GitPullRequestDraft,
	},
	open: {
		label: msg({ message: "Open", context: "status" }),
		ink: "text-emerald-500",
		surface: "bg-green-500/15",
		icon: GitPullRequest,
	},
	queued: {
		label: msg({ message: "Queued" }),
		ink: "text-amber-500",
		surface: "bg-amber-500/15",
		icon: GitPullRequest,
	},
	merged: {
		label: msg({ message: "Merged" }),
		ink: "text-purple-500",
		surface: "bg-violet-500/15",
		icon: GitMerge,
	},
	closed: {
		label: msg({ message: "Closed" }),
		ink: "text-destructive",
		surface: "bg-red-500/15",
		icon: GitPullRequestClosed,
	},
};

/**
 * The same marks as `icon` above, bundled as art for the native surfaces that
 * cannot render a React component — the composer's leading chip.
 *
 * SF Symbols has no pull request: its nearest neighbours are all arrows
 * (`arrow.triangle.pull`, `arrow.triangle.branch`), and none of them reads as
 * the glyph GitHub taught everyone. These are lucide's own paths at 96px, so
 * the chip draws the same mark the sheet and the cards do.
 */
export const PULL_REQUEST_ASSET = {
	draft: require("@/assets/pull-request/draft.png"),
	open: require("@/assets/pull-request/open.png"),
	queued: require("@/assets/pull-request/open.png"),
	merged: require("@/assets/pull-request/merged.png"),
	closed: require("@/assets/pull-request/closed.png"),
} as const satisfies Record<PullRequestStatus, number>;

/**
 * What a native surface draws until the art above has resolved to a file it
 * can read — the same role the session tab's initial plays behind its brand
 * mark, so the chip never flashes empty.
 */
export const PULL_REQUEST_SYMBOL = {
	draft: "arrow.triangle.pull",
	open: "arrow.triangle.pull",
	queued: "arrow.triangle.pull",
	merged: "arrow.triangle.merge",
	closed: "arrow.triangle.pull",
} as const satisfies Record<PullRequestStatus, string>;

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
