import { createFileRoute, Outlet } from "@tanstack/react-router";

export type PullRequestsSearch = {
	search?: string;
	project?: string;
	projects?: string;
	author?: string;
	review?: string;
	state?: "open" | "all";
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
		state: ["open", "all"].includes(search.state as string)
			? (search.state as PullRequestsSearch["state"])
			: undefined,
	}),
});

function PullRequestsLayout() {
	return <Outlet />;
}
