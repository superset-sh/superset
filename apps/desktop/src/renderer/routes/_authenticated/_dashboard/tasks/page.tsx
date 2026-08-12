import { createFileRoute, redirect } from "@tanstack/react-router";
import { useMemo } from "react";
import { resolveProjectFilterParams } from "renderer/routes/_authenticated/_dashboard/components/ProjectFilter/project-filter-utils";
import { TasksView } from "./components/TasksView";
import { Route as TasksLayoutRoute } from "./layout";

export const Route = createFileRoute("/_authenticated/_dashboard/tasks/")({
	// Legacy PR-tab URLs redirect before anything renders — a render-time
	// <Navigate> here re-navigated on every layout re-render (react #185).
	beforeLoad: ({ search }) => {
		if (search.type === "prs") {
			throw redirect({
				to: "/pull-requests",
				search: {
					search: search.search,
					projects: search.projects ?? search.project,
					state: search.state,
				},
				replace: true,
			});
		}
	},
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
	return (
		<TasksView
			initialTab={tab}
			initialAssignee={assignee}
			initialSearch={search}
			initialType={type === "prs" ? undefined : type}
			initialProjects={initialProjects}
			initialLinearProject={linearProject}
			initialState={state}
		/>
	);
}
