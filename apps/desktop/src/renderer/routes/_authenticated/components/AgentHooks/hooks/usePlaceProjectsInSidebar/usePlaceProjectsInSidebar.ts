import { useLiveQuery } from "@tanstack/react-db";
import { useEffect } from "react";
import { useHostProjects } from "renderer/hooks/host-projects/useHostProjects";
import { useDashboardSidebarState } from "renderer/routes/_authenticated/hooks/useDashboardSidebarState";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import { selectProjectsToPlace } from "./selectProjectsToPlace";

/**
 * Places every project this device's host serves into the sidebar exactly
 * once. Projects created outside the renderer (`superset projects create`,
 * an import while the desktop was closed) have no placement row, and the
 * sidebar renders only placed projects — so without this they existed on
 * the host and nowhere else. Placement never depends on the project's
 * workspaces; see `selectProjectsToPlace` for the gates.
 */
export function usePlaceProjectsInSidebar(): void {
	const collections = useCollections();
	const { machineId } = useLocalHostService();
	const { ensureProjectInSidebar } = useDashboardSidebarState();
	const { projects, isReady: projectsReady } = useHostProjects();

	const { data: placementRows = [], isReady: placementReady } = useLiveQuery(
		(query) =>
			query
				.from({ row: collections.v2SidebarProjects })
				.select(({ row }) => ({ projectId: row.projectId })),
		[collections],
	);

	useEffect(() => {
		if (!projectsReady || !placementReady) return;
		const placedProjectIds = new Set(placementRows.map((row) => row.projectId));
		for (const projectId of selectProjectsToPlace(
			projects,
			placedProjectIds,
			machineId,
		)) {
			ensureProjectInSidebar(projectId);
		}
	}, [
		ensureProjectInSidebar,
		machineId,
		placementReady,
		placementRows,
		projects,
		projectsReady,
	]);
}
