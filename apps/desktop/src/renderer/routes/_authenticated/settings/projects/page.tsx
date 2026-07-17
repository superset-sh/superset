import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo } from "react";
import { useHostProjects } from "renderer/hooks/host-projects/useHostProjects";
import { electronTrpc } from "renderer/lib/electron-trpc";

export const Route = createFileRoute("/_authenticated/settings/projects/")({
	component: ProjectsIndexPage,
});

function ProjectsIndexPage() {
	const navigate = useNavigate();

	const { data: groups = [], isLoading: groupsLoading } =
		electronTrpc.workspaces.getAllGrouped.useQuery();

	// Projects are fully local — identity comes from the host fan-out.
	const { projects: hostProjects, isReady } = useHostProjects();
	const v2Projects = useMemo(
		() =>
			hostProjects.map((project) => ({
				id: project.projectKey,
				name: project.name,
			})),
		[hostProjects],
	);

	const firstProjectId = useMemo(() => {
		const v2Sorted = [...v2Projects].sort((a, b) =>
			a.name.localeCompare(b.name),
		);
		if (v2Sorted[0]) return v2Sorted[0].id;

		const loadedV2Ids = new Set(v2Projects.map((p) => p.id));
		const v1Sorted = groups
			.filter(
				(g) =>
					!g.project.neonProjectId || !loadedV2Ids.has(g.project.neonProjectId),
			)
			.map((g) => g.project)
			.sort((a, b) => a.name.localeCompare(b.name));
		return v1Sorted[0]?.id ?? null;
	}, [v2Projects, groups]);

	useEffect(() => {
		if (firstProjectId) {
			navigate({
				to: "/settings/projects/$projectId",
				params: { projectId: firstProjectId },
				replace: true,
			});
		}
	}, [firstProjectId, navigate]);

	const isEmpty = v2Projects.length === 0 && groups.length === 0;
	if (isEmpty) {
		if (!isReady || groupsLoading) return null;
		return (
			<div className="flex items-center justify-center h-full p-6 text-sm text-muted-foreground">
				No projects yet.
			</div>
		);
	}

	return null;
}
