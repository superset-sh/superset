import { cn } from "@superset/ui/utils";
import {
	PR_COLOR_BY_STATE,
	PR_ICON_BY_STATE,
	type PullRequestState,
} from "./pullRequestState";

interface PullRequestStateIconProps {
	state: PullRequestState;
	className?: string;
}

/**
 * Pull-request state as its icon and colour, shared by the sidebar and the
 * Ctrl+Tab switcher.
 *
 * Renders no `title` or `aria-label`: callers own the labelling. The sidebar
 * wraps this in a Radix tooltip and an already-labelled button, so a native
 * `<title>` here would stack a second, less informative OS tooltip on top of
 * the styled one.
 */
export function PullRequestStateIcon({
	state,
	className,
}: PullRequestStateIconProps) {
	const Icon = PR_ICON_BY_STATE[state];

	return (
		<Icon
			className={cn("size-3.5", PR_COLOR_BY_STATE[state], className)}
			strokeWidth={1.75}
		/>
	);
}
