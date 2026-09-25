import { Trans } from "@lingui/react/macro";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo } from "react";
import { useHostProjects } from "renderer/hooks/host-projects/useHostProjects";

export const Route = createFileRoute("/_authenticated/settings/projects/")({
	component: ProjectsIndexPage,
});

function ProjectsIndexPage() {
	const navigate = useNavigate();

	// Projects are fully local — identity comes from the host fan-out.
	const { projects: hostProjects, isReady } = useHostProjects();

	const firstProjectId = useMemo(() => {
		const sorted = [...hostProjects].sort((a, b) =>
			a.name.localeCompare(b.name),
		);
		return sorted[0]?.projectKey ?? null;
	}, [hostProjects]);

	useEffect(() => {
		if (firstProjectId) {
			navigate({
				to: "/settings/projects/$projectId",
				params: { projectId: firstProjectId },
				replace: true,
			});
		}
	}, [firstProjectId, navigate]);

	if (hostProjects.length === 0) {
		if (!isReady) return null;
		return (
			<div className="flex items-center justify-center h-full p-6 text-sm text-muted-foreground">
				<Trans>No projects yet.</Trans>
			</div>
		);
	}

	return null;
}
