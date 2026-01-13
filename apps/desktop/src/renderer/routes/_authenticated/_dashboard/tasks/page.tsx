import { createFileRoute } from "@tanstack/react-router";
import { TasksView } from "renderer/screens/main/components/TasksView";

export const Route = createFileRoute("/_authenticated/_dashboard/tasks/")({
	component: TasksPage,
});

function TasksPage() {
	return <TasksView />;
}
