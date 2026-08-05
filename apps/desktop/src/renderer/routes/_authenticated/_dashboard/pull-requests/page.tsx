import { createFileRoute } from "@tanstack/react-router";
import { PullRequestsView } from "./components/PullRequestsView";
import { Route as PullRequestsLayoutRoute } from "./layout";

export const Route = createFileRoute(
	"/_authenticated/_dashboard/pull-requests/",
)({
	component: PullRequestsPage,
});

function PullRequestsPage() {
	const { search, project, state } = PullRequestsLayoutRoute.useSearch();

	return (
		<PullRequestsView
			initialSearch={search}
			initialProject={project}
			initialState={state}
		/>
	);
}
