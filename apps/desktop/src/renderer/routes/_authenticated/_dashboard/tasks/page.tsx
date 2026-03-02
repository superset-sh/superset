import { createFileRoute } from "@tanstack/react-router";
import { TasksView } from "./components/TasksView";
import { Route as TasksLayoutRoute } from "./layout";

export const Route = createFileRoute("/_authenticated/_dashboard/tasks/")({
	component: TasksPage,
});

function TasksPage() {
	const { tab, assignee, search } = TasksLayoutRoute.useSearch();
	return (
		<TasksView
			initialTab={tab}
			initialAssignee={assignee}
			initialSearch={search}
		/>
	);
}
