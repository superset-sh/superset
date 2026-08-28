import { useLingui } from "@lingui/react/macro";
import { LuPanelLeft, LuPanelLeftClose, LuPanelLeftOpen } from "react-icons/lu";
import { usePullRequestsSplitViewStore } from "../../stores/pullRequestsSplitViewStore";

/**
 * Reclaims the list pane's width for the detail pane. The empty index state
 * has no header of its own, so `layout.tsx` renders this above its `<Outlet
 * />`; the PR detail page has a header row and renders this inline instead,
 * so it stays reachable from every child route without stacking two bars.
 */
export function PullRequestListToggle() {
	const { t } = useLingui();
	const isListCollapsed = usePullRequestsSplitViewStore(
		(s) => s.isListCollapsed,
	);
	const toggleListCollapsed = usePullRequestsSplitViewStore(
		(s) => s.toggleListCollapsed,
	);

	return (
		<button
			type="button"
			onClick={toggleListCollapsed}
			aria-label={
				isListCollapsed
					? t({
							id: "dashboard.pullRequests.listToggle.show",
							message: "Show pull request list",
						})
					: t({
							id: "dashboard.pullRequests.listToggle.hide",
							message: "Hide pull request list",
						})
			}
			className="group flex size-6 items-center justify-center rounded text-muted-foreground transition-colors hover:text-foreground"
		>
			<span className="group-hover:hidden">
				<LuPanelLeft className="size-4" strokeWidth={1.5} />
			</span>
			<span className="hidden group-hover:block">
				{isListCollapsed ? (
					<LuPanelLeftOpen className="size-4" strokeWidth={1.5} />
				) : (
					<LuPanelLeftClose className="size-4" strokeWidth={1.5} />
				)}
			</span>
		</button>
	);
}
