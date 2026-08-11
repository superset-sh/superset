import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo } from "react";
import { useHostProjects } from "renderer/hooks/host-projects/useHostProjects";
import { useIsV2CloudEnabled } from "renderer/hooks/useIsV2CloudEnabled";
import { electronTrpc } from "renderer/lib/electron-trpc";

export const Route = createFileRoute("/_authenticated/settings/projects/")({
	component: ProjectsIndexPage,
});

function ProjectsIndexPage() {
	const navigate = useNavigate();
	const isV2CloudEnabled = useIsV2CloudEnabled();

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
		if (isV2CloudEnabled) {
			const v2Sorted = [...v2Projects].sort((a, b) =>
				a.name.localeCompare(b.name),
			);
			return v2Sorted[0]?.id ?? null;
		}

		const v1Sorted = groups
			.map((g) => g.project)
			.sort((a, b) => a.name.localeCompare(b.name));
		return v1Sorted[0]?.id ?? null;
	}, [v2Projects, groups, isV2CloudEnabled]);

	useEffect(() => {
		if (firstProjectId) {
			navigate({
				to: "/settings/projects/$projectId",
				params: { projectId: firstProjectId },
				replace: true,
			});
		}
	}, [firstProjectId, navigate]);

	const isEmpty = isV2CloudEnabled
		? v2Projects.length === 0
		: groups.length === 0;
	if (isEmpty) {
		if (isV2CloudEnabled ? !isReady : groupsLoading) return null;
		return (
			<div className="flex items-center justify-center h-full p-6 text-sm text-muted-foreground">
				No projects yet.
			</div>
		);
	}

	return null;
}
