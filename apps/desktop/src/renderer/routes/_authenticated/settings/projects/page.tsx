import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/settings/projects/")({
	component: ProjectsIndexPage,
});

function ProjectsIndexPage() {
	return (
		<div className="flex items-center justify-center h-full p-6 text-sm text-muted-foreground">
			Select a project from the left to configure its settings.
		</div>
	);
}
