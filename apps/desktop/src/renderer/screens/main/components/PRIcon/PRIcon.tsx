import { cn } from "@superset/ui/utils";
import {
	LuCircleDot,
	LuGitMerge,
	LuGitPullRequestArrow,
	LuListChecks,
} from "react-icons/lu";

const ICON_STROKE_WIDTH = 2;

export type PRState = "open" | "merged" | "closed" | "draft" | "queued";

interface PRIconProps {
	state: PRState;
	className?: string;
}

// `dark:` isn't used here — this app's globals.css never defines
// `@custom-variant dark`, so `dark:` falls back to `prefers-color-scheme`
// (tracks the OS setting, not this app's own theme switcher). `[.dark_&]`
// targets the real `.dark` class the theme store puts on <html>. Dark hex
// values match the PR state badge (STATE_BADGE_STYLES in $prNumber/page.tsx)
// for consistency between the pill and the icon.
const stateStyles: Record<PRState, string> = {
	open: "text-emerald-500 [.dark_&]:text-[#34d399]",
	merged: "text-violet-500 [.dark_&]:text-[#b0a6d9]",
	closed: "text-red-500 [.dark_&]:text-[#e0918a]",
	draft: "text-muted-foreground",
	queued: "text-amber-500 [.dark_&]:text-[#fbbf24]",
};

/**
 * Renders a PR icon with color based on state.
 * - open: green pull request icon
 * - merged: purple/violet merge icon
 * - closed: red dot icon
 * - draft: muted pull request icon
 * - queued: amber queue icon (PR waiting in the merge queue)
 */
export function PRIcon({ state, className }: PRIconProps) {
	const baseClass = cn(stateStyles[state], className);

	if (state === "merged") {
		return <LuGitMerge className={baseClass} strokeWidth={ICON_STROKE_WIDTH} />;
	}

	if (state === "closed") {
		return (
			<LuCircleDot className={baseClass} strokeWidth={ICON_STROKE_WIDTH} />
		);
	}

	if (state === "queued") {
		return (
			<LuListChecks className={baseClass} strokeWidth={ICON_STROKE_WIDTH} />
		);
	}

	// open or draft
	return (
		<LuGitPullRequestArrow
			className={baseClass}
			strokeWidth={ICON_STROKE_WIDTH}
		/>
	);
}
