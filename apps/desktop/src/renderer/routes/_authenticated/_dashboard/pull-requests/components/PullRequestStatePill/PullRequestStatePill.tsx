import { Trans } from "@lingui/react/macro";
import { cn } from "@superset/ui/utils";
import type { ReactNode } from "react";
import { LuLoaderCircle } from "react-icons/lu";
import { normalizePRState } from "renderer/screens/main/components/PRIcon";
import type { PullRequestDetail } from "../../hooks/usePullRequestDetail";
import {
	PR_STATE_INK_CLASS_NAME,
	type PullRequestGlyphState,
	PullRequestStateGlyph,
} from "../PullRequestStateGlyph";

interface PullRequestStatePillProps {
	data: Pick<PullRequestDetail, "state" | "isDraft" | "mergeability">;
	/** Replaces the state word while an action is in flight ("Merging…"). */
	pendingLabel?: string | null;
	trailing?: ReactNode;
	className?: string;
}

/** The state word in its own ink over a 12% tint of that ink. */
export function PullRequestStatePill({
	data,
	pendingLabel,
	trailing,
	className,
}: PullRequestStatePillProps) {
	const hasConflicts =
		data.state === "open" &&
		!data.isDraft &&
		data.mergeability === "conflicting";
	const state: PullRequestGlyphState = hasConflicts
		? "conflicting"
		: normalizePRState(data.state, data.isDraft);
	return (
		<span
			className={cn(
				"inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium",
				"bg-[color-mix(in_srgb,currentColor_12%,transparent)]",
				PR_STATE_INK_CLASS_NAME[state],
				className,
			)}
			aria-live="polite"
		>
			{pendingLabel ? (
				<LuLoaderCircle className="size-3.5 animate-spin motion-reduce:animate-none" />
			) : (
				<PullRequestStateGlyph state={state} className="size-3.5" />
			)}
			<span>
				{pendingLabel ??
					(state === "draft" ? (
						<Trans>Draft</Trans>
					) : state === "conflicting" ? (
						<Trans>Has conflicts</Trans>
					) : state === "merged" ? (
						<Trans>Merged</Trans>
					) : state === "closed" ? (
						<Trans>Closed</Trans>
					) : state === "queued" ? (
						<Trans>Queued</Trans>
					) : (
						<Trans>Open</Trans>
					))}
			</span>
			{trailing}
		</span>
	);
}
