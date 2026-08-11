import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useMemo } from "react";
import { resolveProjectFilterParams } from "renderer/routes/_authenticated/_dashboard/components/ProjectFilter/project-filter-utils";
import { TasksView } from "./components/TasksView";
import { Route as TasksLayoutRoute } from "./layout";

export const Route = createFileRoute("/_authenticated/_dashboard/tasks/")({
	component: TasksPage,
});

function TasksPage() {
	const {
		tab,
		assignee,
		search,
		type,
		project,
		projects,
		linearProject,
		state,
	} = TasksLayoutRoute.useSearch();
	// Stable identity: effects downstream key off this array.
	const initialProjects = useMemo(
		() => resolveProjectFilterParams(projects, project, undefined),
		[projects, project],
	);
	if (type === "prs") {
		return (
			<Navigate
				to="/pull-requests"
				search={{
					search,
					projects: projects ?? project,
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
			initialProjects={initialProjects}
			initialLinearProject={linearProject}
			initialState={state}
		/>
	);
}
