import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";
import { resolveProjectFilterParams } from "renderer/routes/_authenticated/_dashboard/components/ProjectFilter/project-filter-utils";
import { Route as TasksLayoutRoute } from "../layout";
import { tasksSearchFromFilters } from "../stores/tasks-filter-state";
import { TaskRecordScreen } from "./components/TaskRecordScreen";
import { useEscapeToNavigate } from "./hooks/useEscapeToNavigate";

export const Route = createFileRoute(
	"/_authenticated/_dashboard/tasks/$taskId/",
)({
	component: TaskDetailPage,
});

function TaskDetailPage() {
	const { taskId } = Route.useParams();
	const {
		tab,
		assignee,
		search: searchQuery,
		type,
		project,
		projects,
		linearProject,
		state,
	} = TasksLayoutRoute.useSearch();
	const navigate = useNavigate();

	const backSearch = useMemo(() => {
		return tasksSearchFromFilters({
			tab: tab ?? "all",
			assignee: assignee ?? null,
			search: searchQuery ?? "",
			typeTab: type === "issues" ? "issues" : "tasks",
			projectFilters: resolveProjectFilterParams(projects, project, []),
			linearProjectFilter: linearProject ?? null,
			includeClosedIssues: state === "all",
		});
	}, [
		tab,
		assignee,
		searchQuery,
		type,
		project,
		projects,
		linearProject,
		state,
	]);
	useEscapeToNavigate("/tasks", { search: backSearch });

	return (
		<TaskRecordScreen
			taskId={taskId}
			onBack={() => navigate({ to: "/tasks", search: backSearch })}
			onOpenAssignee={(userId) =>
				navigate({
					to: "/tasks",
					search: { ...backSearch, assignee: userId },
				})
			}
		/>
	);
}
