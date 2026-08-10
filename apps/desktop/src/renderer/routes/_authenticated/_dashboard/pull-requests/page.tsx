import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { resolveProjectFilterParams } from "renderer/routes/_authenticated/_dashboard/components/ProjectFilter/project-filter-utils";
import { PullRequestsView } from "./components/PullRequestsView";
import { Route as PullRequestsLayoutRoute } from "./layout";

export const Route = createFileRoute(
	"/_authenticated/_dashboard/pull-requests/",
)({
	component: PullRequestsPage,
});

function PullRequestsPage() {
	const { search, project, projects, author, review, state } =
		PullRequestsLayoutRoute.useSearch();
	// Stable identity: effects downstream key off this array.
	const initialProjects = useMemo(
		() => resolveProjectFilterParams(projects, project, undefined),
		[projects, project],
	);

	return (
		<PullRequestsView
			initialSearch={search}
			initialProjects={initialProjects}
			initialAuthor={author}
			initialReview={review}
			initialState={state}
		/>
	);
}
