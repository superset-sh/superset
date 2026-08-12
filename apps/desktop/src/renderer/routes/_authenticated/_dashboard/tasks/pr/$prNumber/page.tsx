import { createFileRoute, redirect } from "@tanstack/react-router";

// Legacy PR-detail URLs redirect before anything renders — a render-time
// <Navigate> here re-navigated on every layout re-render (react #185).
export const Route = createFileRoute(
	"/_authenticated/_dashboard/tasks/pr/$prNumber/",
)({
	beforeLoad: ({ params, search }) => {
		throw redirect({
			to: "/pull-requests/$prNumber",
			params: { prNumber: params.prNumber },
			search: {
				search: search.search,
				project: search.project,
				state: search.state,
			},
			replace: true,
		});
	},
});
