import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/settings/workspace/")({
	component: WorkspaceSettingsPage,
});

function WorkspaceSettingsPage() {
	return (
		<div>
			<h2>Workspace Settings</h2>
			<p>Workspace settings placeholder</p>
		</div>
	);
}
