import { createFileRoute, Outlet } from "@tanstack/react-router";
import { StartWorkingDialog } from "./components/StartWorkingDialog";

export type TasksSearch = {
	tab?: "all" | "active" | "backlog";
};

export const Route = createFileRoute("/_authenticated/_dashboard/tasks")({
	component: TasksLayout,
	validateSearch: (search: Record<string, unknown>): TasksSearch => ({
		tab: ["all", "active", "backlog"].includes(search.tab as string)
			? (search.tab as TasksSearch["tab"])
			: undefined,
	}),
});

function TasksLayout() {
	return (
		<>
			<Outlet />
			<StartWorkingDialog />
		</>
	);
}
