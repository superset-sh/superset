import { useLiveQuery } from "@tanstack/react-db";
import { useMemo } from "react";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import type { V2SidebarProject, V2SidebarWorkspace } from "../../types";

export function useV2SidebarData() {
	const collections = useCollections();

	const { data: projects = [] } = useLiveQuery(
		(q) => q.from({ v2Projects: collections.v2Projects }),
		[collections],
	);

	const { data: workspaces = [] } = useLiveQuery(
		(q) => q.from({ v2Workspaces: collections.v2Workspaces }),
		[collections],
	);

	const groups = useMemo<V2SidebarProject[]>(() => {
		const workspacesByProject = new Map<string, V2SidebarWorkspace[]>();

		for (const workspace of workspaces) {
			const projectWorkspaces =
				workspacesByProject.get(workspace.projectId) ?? [];
			projectWorkspaces.push({
				id: workspace.id,
				projectId: workspace.projectId,
				deviceId: workspace.deviceId ?? null,
				name: workspace.name,
				branch: workspace.branch,
				createdAt: workspace.createdAt,
				updatedAt: workspace.updatedAt,
			});
			workspacesByProject.set(workspace.projectId, projectWorkspaces);
		}

		return [...projects]
			.sort((a, b) => a.name.localeCompare(b.name))
			.map((project) => ({
				id: project.id,
				name: project.name,
				slug: project.slug,
				githubRepositoryId: project.githubRepositoryId ?? null,
				createdAt: project.createdAt,
				updatedAt: project.updatedAt,
				workspaces: (workspacesByProject.get(project.id) ?? []).sort((a, b) =>
					a.name.localeCompare(b.name),
				),
			}));
	}, [projects, workspaces]);

	const totalWorkspaceCount = useMemo(
		() =>
			groups.reduce((count, project) => count + project.workspaces.length, 0),
		[groups],
	);

	return {
		groups,
		totalWorkspaceCount,
		isEmpty: totalWorkspaceCount === 0,
	};
}
