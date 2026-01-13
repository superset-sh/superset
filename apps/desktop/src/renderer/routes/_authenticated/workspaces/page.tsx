import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/workspaces/")({
	component: WorkspacesPage,
});

function WorkspacesPage() {
	return (
		<div>
			<h1>Workspaces List</h1>
			<p>Workspaces list page placeholder</p>
		</div>
	);
}
