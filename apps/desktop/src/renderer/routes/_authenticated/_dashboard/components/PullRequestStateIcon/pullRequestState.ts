import {
	LuGitMerge,
	LuGitPullRequest,
	LuGitPullRequestClosed,
	LuGitPullRequestDraft,
	LuListChecks,
} from "react-icons/lu";
import type { PullRequestState } from "shared/pull-request-types";

export type { PullRequestState };

/**
 * Icon, colour and label per pull-request state.
 *
 * Extracted from DashboardSidebarWorkspaceIcon so the sidebar and the Ctrl+Tab
 * switcher render a PR the same way. Duplicating these maps would let the two
 * drift until "merged" meant a different colour in each place.
 */
export const PR_ICON_BY_STATE = {
	open: LuGitPullRequest,
	merged: LuGitMerge,
	closed: LuGitPullRequestClosed,
	draft: LuGitPullRequestDraft,
	queued: LuListChecks,
} as const satisfies Record<PullRequestState, unknown>;

export const PR_COLOR_BY_STATE = {
	open: "text-emerald-500",
	merged: "text-purple-500",
	closed: "text-destructive",
	draft: "text-muted-foreground",
	queued: "text-amber-500",
} as const satisfies Record<PullRequestState, string>;

export const PR_STATE_LABEL = {
	open: "Open",
	merged: "Merged",
	closed: "Closed",
	draft: "Draft",
	queued: "Queued",
} as const satisfies Record<PullRequestState, string>;
