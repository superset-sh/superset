import { useLingui } from "@lingui/react/macro";
import {
	LuPanelRight,
	LuPanelRightClose,
	LuPanelRightOpen,
} from "react-icons/lu";
import { usePullRequestsSplitViewStore } from "../../stores/pullRequestsSplitViewStore";

/**
 * Reclaims the detail pane's width for the list — the mirror image of
 * `PullRequestListToggle`. Rendered from the list's own top bar so it stays
 * reachable even when the detail pane is fully hidden.
 */
export function PullRequestDetailToggle() {
	const { t } = useLingui();
	const isDetailCollapsed = usePullRequestsSplitViewStore(
		(s) => s.isDetailCollapsed,
	);
	const toggleDetailCollapsed = usePullRequestsSplitViewStore(
		(s) => s.toggleDetailCollapsed,
	);

	return (
		<button
			type="button"
			onClick={toggleDetailCollapsed}
			aria-label={
				isDetailCollapsed
					? t({
							message: "Show pull request preview",
						})
					: t({
							message: "Hide pull request preview",
						})
			}
			className="group flex size-6 items-center justify-center rounded text-muted-foreground transition-colors hover:text-foreground"
		>
			<span className="group-hover:hidden">
				<LuPanelRight className="size-4" strokeWidth={1.5} />
			</span>
			<span className="hidden group-hover:block">
				{isDetailCollapsed ? (
					<LuPanelRightOpen className="size-4" strokeWidth={1.5} />
				) : (
					<LuPanelRightClose className="size-4" strokeWidth={1.5} />
				)}
			</span>
		</button>
	);
}
