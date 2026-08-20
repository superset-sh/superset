import {
	DIFF_STAT_NEGATIVE_CLASSNAME,
	DIFF_STAT_POSITIVE_CLASSNAME,
} from "renderer/routes/_authenticated/_dashboard/pull-requests/utils/diffStatStyles";
import type { RiskLevel } from "../types/review";

export { DIFF_STAT_NEGATIVE_CLASSNAME, DIFF_STAT_POSITIVE_CLASSNAME };

/**
 * Tag/alert colors lifted directly from the Figma spec (High risk pill:
 * bg #fde5e5 / text #f43b3a; Open & Resolved pill: bg #dcfae8 / text #00a558;
 * diff stat additions #009951, deletions #dc362e). Figma only specified red
 * and green — amber (medium risk) has no source value, so it follows the
 * same pale-bg/saturated-text shape. Dark variants aren't in the Figma file
 * (light-mode only); they follow this codebase's existing soft-tint pattern
 * (see checkStatusIcons.ts) rather than the literal light hexes, since a
 * solid pale fill wouldn't read on a dark background.
 */
export const REVIEW_TAG_STYLES = {
	red: "bg-[#fde5e5] text-[#f43b3a] border-transparent dark:bg-red-500/15 dark:text-red-400 dark:border-red-500/20",
	amber:
		"bg-[#fef3c6] text-[#a15c07] border-transparent dark:bg-amber-500/15 dark:text-amber-400 dark:border-amber-500/20",
	green:
		"bg-[#dcfae8] text-[#00a558] border-transparent dark:bg-emerald-500/15 dark:text-emerald-400 dark:border-emerald-500/20",
} as const;

export type ReviewTagColor = keyof typeof REVIEW_TAG_STYLES;

export const RISK_LEVEL_TAG_COLOR: Record<
	Exclude<RiskLevel, null>,
	ReviewTagColor
> = {
	high: "red",
	medium: "amber",
	low: "green",
};

/** Review Focus callout icon: Figma uses rgba(253,229,229,0.6) — #fde5e5 at 60% opacity. */
export const REVIEW_FOCUS_ALERT_CLASSNAME =
	"bg-[#fde5e5]/60 text-[#f43b3a] dark:bg-red-500/10 dark:text-red-400";
