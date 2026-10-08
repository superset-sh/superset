import { cn } from "@superset/ui/utils";
import {
	GitMerge,
	GitPullRequestArrow,
	GitPullRequestClosed,
	GitPullRequestDraft,
	ListChecks,
} from "lucide-react";
import type { PRState } from "renderer/screens/main/components/PRIcon";
import {
	PR_GREEN_TEXT_CLASS_NAME,
	PR_RED_TEXT_CLASS_NAME,
} from "../pull-request-colors";

export type PullRequestGlyphState = PRState | "conflicting";

/** Ink per state; the pill tints its background from the same currentColor. */
export const PR_STATE_INK_CLASS_NAME: Record<PullRequestGlyphState, string> = {
	open: PR_GREEN_TEXT_CLASS_NAME,
	draft: "text-muted-foreground",
	merged: "text-violet-500 [.dark_&]:text-[#b0a6d9]",
	closed: "text-muted-foreground",
	queued: "text-amber-600 [.dark_&]:text-[#fbbf24]",
	conflicting: PR_RED_TEXT_CLASS_NAME,
};

const GLYPHS = {
	open: GitPullRequestArrow,
	draft: GitPullRequestDraft,
	merged: GitMerge,
	closed: GitPullRequestClosed,
	queued: ListChecks,
	conflicting: GitMerge,
} as const;

interface PullRequestStateGlyphProps {
	state: PullRequestGlyphState;
	className?: string;
}

/** One glyph per pull request state, in the light stroke the page's icons share. */
export function PullRequestStateGlyph({
	state,
	className,
}: PullRequestStateGlyphProps) {
	const Icon = GLYPHS[state];
	return (
		<Icon
			aria-hidden
			strokeWidth={1.75}
			className={cn("shrink-0", PR_STATE_INK_CLASS_NAME[state], className)}
		/>
	);
}
