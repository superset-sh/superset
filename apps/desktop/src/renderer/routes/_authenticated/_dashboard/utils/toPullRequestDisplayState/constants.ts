import type { IconType } from "react-icons";
import {
	LuGitMerge,
	LuGitPullRequest,
	LuGitPullRequestClosed,
	LuGitPullRequestDraft,
} from "react-icons/lu";
import type { PullRequestDisplayState } from "./toPullRequestDisplayState";

export const PULL_REQUEST_ICON: Record<PullRequestDisplayState, IconType> = {
	open: LuGitPullRequest,
	draft: LuGitPullRequestDraft,
	merged: LuGitMerge,
	closed: LuGitPullRequestClosed,
};

export const PULL_REQUEST_COLOR: Record<PullRequestDisplayState, string> = {
	open: "text-emerald-500",
	draft: "text-muted-foreground",
	merged: "text-purple-500",
	closed: "text-destructive",
};
