import { cn } from "@superset/ui/utils";
import { createFileRoute, Outlet, useParams } from "@tanstack/react-router";
import { useMemo } from "react";
import { resolveProjectFilterParams } from "renderer/routes/_authenticated/_dashboard/components/ProjectFilter/project-filter-utils";
import { parsePositiveIntegerParam } from "renderer/routes/_authenticated/_dashboard/utils/parsePositiveIntegerParam";
import { ResizablePanel } from "renderer/screens/main/components/ResizablePanel";
import { useWorkspaceSidebarStore } from "renderer/stores/workspace-sidebar-state";
import { PullRequestListToggle } from "./components/PullRequestListToggle";
import { PullRequestsView } from "./components/PullRequestsView";
import {
	DEFAULT_PULL_REQUESTS_LIST_WIDTH,
	MAX_PULL_REQUESTS_LIST_WIDTH,
	MIN_PULL_REQUESTS_LIST_WIDTH,
	usePullRequestsSplitViewStore,
} from "./stores/pullRequestsSplitViewStore";

export type PullRequestsSearch = {
	search?: string;
	project?: string;
	projects?: string;
	author?: string;
	review?: string;
	state?: "open" | "all" | "merged";
};

export const Route = createFileRoute(
	"/_authenticated/_dashboard/pull-requests",
)({
	component: PullRequestsLayout,
	validateSearch: (search: Record<string, unknown>): PullRequestsSearch => ({
		search: typeof search.search === "string" ? search.search : undefined,
		project: typeof search.project === "string" ? search.project : undefined,
		projects: typeof search.projects === "string" ? search.projects : undefined,
		author: typeof search.author === "string" ? search.author : undefined,
		review: typeof search.review === "string" ? search.review : undefined,
		state: ["open", "all", "merged"].includes(search.state as string)
			? (search.state as PullRequestsSearch["state"])
			: undefined,
	}),
});

/**
 * Split view, per Figma (SuperReviewSplit): the list stays mounted in a
 * resizable left pane while the child route (index = empty state,
 * $prNumber = detail) renders in the flexible right pane via `<Outlet />`.
 * Selecting a different PR updates the right pane only — the list never
 * unmounts, so scroll position and in-flight pagination survive. Either
 * pane can be collapsed to give the other the full width; collapsing one
 * always reveals the other, since hiding both would leave nothing on screen.
 */
function PullRequestsLayout() {
	const { search, project, projects, author, review, state } =
		Route.useSearch();
	const params = useParams({ strict: false }) as { prNumber?: string };
	const selectedPrNumber = params.prNumber
		? parsePositiveIntegerParam(params.prNumber)
		: null;
	const isListCollapsed = usePullRequestsSplitViewStore(
		(s) => s.isListCollapsed,
	);
	const isDetailCollapsed = usePullRequestsSplitViewStore(
		(s) => s.isDetailCollapsed,
	);
	const listWidth = usePullRequestsSplitViewStore((s) => s.width);
	const setListWidth = usePullRequestsSplitViewStore((s) => s.setWidth);
	const isResizingList = usePullRequestsSplitViewStore((s) => s.isResizing);
	const setIsResizingList = usePullRequestsSplitViewStore(
		(s) => s.setIsResizing,
	);
	const isAppSidebarCollapsed = useWorkspaceSidebarStore((s) =>
		s.isCollapsed(),
	);
	// Stable identity: effects downstream key off this array.
	const initialProjects = useMemo(
		() => resolveProjectFilterParams(projects, project, undefined),
		[projects, project],
	);

	const listContent = (
		<PullRequestsView
			initialSearch={search}
			initialProjects={initialProjects}
			initialAuthor={author}
			initialReview={review}
			initialState={state}
			selectedPrNumber={selectedPrNumber}
			selectedPrProjectId={project ?? null}
		/>
	);

	return (
		<div
			className={cn(
				"flex h-full min-h-0 min-w-0 flex-1 overflow-hidden",
				isAppSidebarCollapsed && "rounded-tl-[8px] bg-sidebar dark:bg-muted/35",
			)}
		>
			{!isListCollapsed && (
				<ResizablePanel
					disabled={isDetailCollapsed}
					width={listWidth}
					onWidthChange={setListWidth}
					isResizing={isResizingList}
					onResizingChange={setIsResizingList}
					minWidth={MIN_PULL_REQUESTS_LIST_WIDTH}
					maxWidth={MAX_PULL_REQUESTS_LIST_WIDTH}
					handleSide="right"
					onDoubleClickHandle={() =>
						setListWidth(DEFAULT_PULL_REQUESTS_LIST_WIDTH)
					}
					className={cn(
						"flex min-h-0 flex-col bg-background",
						isAppSidebarCollapsed && "rounded-tl-[8px]",
					)}
				>
					{listContent}
				</ResizablePanel>
			)}
			{!isDetailCollapsed && (
				<div
					className={cn(
						"flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background",
						isAppSidebarCollapsed && isListCollapsed && "rounded-tl-[8px]",
					)}
				>
					{params.prNumber === undefined && (
						<div className="flex shrink-0 items-center justify-end px-4 pt-2">
							<PullRequestListToggle />
						</div>
					)}
					<Outlet />
				</div>
			)}
		</div>
	);
}
