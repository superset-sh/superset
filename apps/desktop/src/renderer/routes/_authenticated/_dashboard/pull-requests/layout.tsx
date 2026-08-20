import { createFileRoute, Outlet, useParams } from "@tanstack/react-router";
import { useMemo } from "react";
import { resolveProjectFilterParams } from "renderer/routes/_authenticated/_dashboard/components/ProjectFilter/project-filter-utils";
import { parsePositiveIntegerParam } from "../utils/parsePositiveIntegerParam";
import { PullRequestsView } from "./components/PullRequestsView";
import { usePullRequestsListPaneStore } from "./stores/pullRequestsListPaneStore";
import { PULL_REQUESTS_VIEW_TABS } from "./utils/viewerRelationship";

export type PullRequestsSearch = {
	search?: string;
	project?: string;
	projects?: string;
	author?: string;
	review?: string;
	state?: "open" | "all" | "merged";
	tab?: "all" | "reviewing" | "authored";
};

const VIEW_TAB_VALUES = PULL_REQUESTS_VIEW_TABS.map((tab) => tab.value);

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
		tab: VIEW_TAB_VALUES.includes(search.tab as never)
			? (search.tab as PullRequestsSearch["tab"])
			: undefined,
	}),
});

function PullRequestsLayout() {
	const { search, project, projects, author, review, state, tab } =
		Route.useSearch();
	const params = useParams({ strict: false }) as { prNumber?: string };
	const selectedPrNumber = params.prNumber
		? parsePositiveIntegerParam(params.prNumber)
		: null;
	// Stable identity: effects downstream key off this array.
	const initialProjects = useMemo(
		() => resolveProjectFilterParams(projects, project, undefined),
		[projects, project],
	);
	const isListCollapsed = usePullRequestsListPaneStore(
		(pane) => pane.isCollapsed,
	);

	return (
		<div className="flex h-full min-h-0 w-full">
			{!isListCollapsed && (
				<div className="flex min-h-0 w-[360px] shrink-0 flex-col border-r border-border @lg:w-[420px]">
					<PullRequestsView
						initialSearch={search}
						initialProjects={initialProjects}
						initialAuthor={author}
						initialReview={review}
						initialState={state}
						initialViewTab={tab}
						selectedPrNumber={selectedPrNumber}
						selectedPrProjectId={project ?? null}
					/>
				</div>
			)}
			<div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
				<Outlet />
			</div>
		</div>
	);
}
