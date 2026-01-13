import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/workspace/")({
	component: WorkspacePage,
});

function WorkspacePage() {
	console.log("[Router] Workspace page loaded");
	return (
		<div>
			<h1>Workspace Selector</h1>
			<p>Workspace selector page placeholder</p>
		</div>
	);
}
