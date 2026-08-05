import { createFileRoute, Navigate } from "@tanstack/react-router";
import { Route as TasksLayoutRoute } from "../../layout";

export const Route = createFileRoute(
	"/_authenticated/_dashboard/tasks/pr/$prNumber/",
)({
	component: LegacyPullRequestRedirect,
});

function LegacyPullRequestRedirect() {
	const { prNumber } = Route.useParams();
	const { search, project, state } = TasksLayoutRoute.useSearch();

	return (
		<Navigate
			to="/pull-requests/$prNumber"
			params={{ prNumber }}
			search={{ search, project, state }}
			replace
		/>
	);
}
