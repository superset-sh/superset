import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { LuPanelLeft, LuPanelLeftClose, LuPanelLeftOpen } from "react-icons/lu";
import { usePullRequestsSplitViewStore } from "../../stores/pullRequestsSplitViewStore";

/**
 * Reclaims the list pane's width for the detail pane. Rendered once from
 * `layout.tsx` above `<Outlet />` so it stays available on every child route
 * (including the empty index state), not just the PR detail page.
 */
export function PullRequestListToggle() {
	const isListCollapsed = usePullRequestsSplitViewStore(
		(s) => s.isListCollapsed,
	);
	const toggleListCollapsed = usePullRequestsSplitViewStore(
		(s) => s.toggleListCollapsed,
	);

	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<button
					type="button"
					onClick={toggleListCollapsed}
					aria-label={
						isListCollapsed
							? "Show pull request list"
							: "Hide pull request list"
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
			</TooltipTrigger>
			<TooltipContent side="bottom">
				{isListCollapsed ? "Show pull request list" : "Hide pull request list"}
			</TooltipContent>
		</Tooltip>
	);
}
