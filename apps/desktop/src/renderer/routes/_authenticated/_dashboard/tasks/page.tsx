import { createFileRoute, Navigate } from "@tanstack/react-router";
import { TasksView } from "./components/TasksView";
import { Route as TasksLayoutRoute } from "./layout";

export const Route = createFileRoute("/_authenticated/_dashboard/tasks/")({
	component: TasksPage,
});

function TasksPage() {
	const { tab, assignee, search, type, project, linearProject, state } =
		TasksLayoutRoute.useSearch();
	if (type === "prs") {
		return (
			<Navigate
				to="/pull-requests"
				search={{
					search,
					project,
					state,
				}}
				replace
			/>
		);
	}
	return (
		<TasksView
			initialTab={tab}
			initialAssignee={assignee}
			initialSearch={search}
			initialType={type}
			initialProject={project}
			initialLinearProject={linearProject}
			initialState={state}
		/>
	);
}
