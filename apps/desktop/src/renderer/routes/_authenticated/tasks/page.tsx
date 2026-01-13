import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/tasks/")({
	component: TasksPage,
});

function TasksPage() {
	return (
		<div>
			<h1>Tasks</h1>
			<p>Tasks page placeholder</p>
		</div>
	);
}
