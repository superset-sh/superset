import { cn } from "@superset/ui/utils";
import { createFileRoute, Outlet } from "@tanstack/react-router";
import { useMemo } from "react";
import { resolveProjectFilterParams } from "renderer/routes/_authenticated/_dashboard/components/ProjectFilter/project-filter-utils";
import { useWorkspaceSidebarStore } from "renderer/stores/workspace-sidebar-state";
import { PullRequestListToggle } from "./components/PullRequestListToggle";
import { PullRequestsView } from "./components/PullRequestsView";
import { usePullRequestsSplitViewStore } from "./stores/pullRequestsSplitViewStore";

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
 * fixed-width left pane while the child route (index = empty state,
 * $prNumber = detail) renders in the flexible right pane via `<Outlet />`.
 * Selecting a different PR updates the right pane only — the list never
 * unmounts, so scroll position and in-flight pagination survive.
 */
function PullRequestsLayout() {
	const { search, project, projects, author, review, state } =
		Route.useSearch();
	const isListCollapsed = usePullRequestsSplitViewStore(
		(s) => s.isListCollapsed,
	);
	const isAppSidebarCollapsed = useWorkspaceSidebarStore((s) =>
		s.isCollapsed(),
	);
	// Stable identity: effects downstream key off this array.
	const initialProjects = useMemo(
		() => resolveProjectFilterParams(projects, project, undefined),
		[projects, project],
	);

	return (
		<div
			className={cn(
				"flex h-full min-h-0 min-w-0 flex-1 overflow-hidden",
				isAppSidebarCollapsed && "rounded-tl-[8px] bg-sidebar dark:bg-muted/35",
			)}
		>
			{!isListCollapsed && (
				<div
					className={cn(
						"flex h-full min-h-0 w-[420px] shrink-0 flex-col overflow-hidden border-r border-border bg-background",
						isAppSidebarCollapsed && "rounded-tl-[8px]",
					)}
				>
					<PullRequestsView
						initialSearch={search}
						initialProjects={initialProjects}
						initialAuthor={author}
						initialReview={review}
						initialState={state}
					/>
				</div>
			)}
			<div
				className={cn(
					"flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background",
					isAppSidebarCollapsed && isListCollapsed && "rounded-tl-[8px]",
				)}
			>
				<div className="flex shrink-0 items-center justify-end px-4 pt-2">
					<PullRequestListToggle />
				</div>
				<Outlet />
			</div>
		</div>
	);
}
