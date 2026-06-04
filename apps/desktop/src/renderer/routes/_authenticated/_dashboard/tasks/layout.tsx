import { createFileRoute, Outlet } from "@tanstack/react-router";

export type TasksSearch = {
	tab?: "all" | "active" | "backlog";
	assignee?: string;
	search?: string;
	type?: "tasks" | "prs" | "issues";
	project?: string;
};

export const Route = createFileRoute("/_authenticated/_dashboard/tasks")({
	component: TasksLayout,
	validateSearch: (search: Record<string, unknown>): TasksSearch => ({
		tab: ["all", "active", "backlog"].includes(search.tab as string)
			? (search.tab as TasksSearch["tab"])
			: undefined,
		assignee: typeof search.assignee === "string" ? search.assignee : undefined,
		search: typeof search.search === "string" ? search.search : undefined,
		type: ["tasks", "prs", "issues"].includes(search.type as string)
			? (search.type as TasksSearch["type"])
			: undefined,
		project: typeof search.project === "string" ? search.project : undefined,
	}),
});

function TasksLayout() {
	return <Outlet />;
}
