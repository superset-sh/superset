import { useLiveQuery } from "@tanstack/react-db";
import { useMemo } from "react";
import { useHostProjects } from "renderer/hooks/host-projects/useHostProjects";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import {
	getSidebarWorkspaceIsHidden,
	isAutoIncludedLocalMainWorkspace,
} from "renderer/routes/_authenticated/providers/CollectionsProvider/dashboardSidebarLocal";
import { useHostWorkspaces } from "renderer/routes/_authenticated/providers/HostWorkspacesProvider";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";

/**
 * The set of workspace ids that actually appear in the user's v2 dashboard
 * sidebar. This is the per-user, per-org "my workspaces" view: explicitly
 * placed (and not hidden) workspaces plus auto-included local `main`
 * workspaces, both gated on the projects the user added to their sidebar.
 *
 * Notifications and ports filter against this so a user is never bothered by a
 * coworker's workspace that merely shares the org's Electric stream.
 */
export function useVisibleSidebarWorkspaceIds(): Set<string> {
	const collections = useCollections();
	const { machineId } = useLocalHostService();

	// Placement rows joined against live host-served projects (projects are
	// fully local; the old inner join against the cloud collection is gone).
	const { data: sidebarPlacementRows = [] } = useLiveQuery(
		(q) =>
			q
				.from({ sidebarProjects: collections.v2SidebarProjects })
				.select(({ sidebarProjects }) => ({
					projectId: sidebarProjects.projectId,
				})),
		[collections],
	);
	const { projects: hostProjects } = useHostProjects();
	const sidebarProjects = useMemo(() => {
		const known = new Set(hostProjects.map((project) => project.projectKey));
		return sidebarPlacementRows.filter((row) => known.has(row.projectId));
	}, [sidebarPlacementRows, hostProjects]);

	const { data: localStateRows = [] } = useLiveQuery(
		(q) =>
			q
				.from({ sidebarWorkspaces: collections.v2WorkspaceLocalState })
				.select(({ sidebarWorkspaces }) => ({
					id: sidebarWorkspaces.workspaceId,
					projectId: sidebarWorkspaces.sidebarState.projectId,
					isHidden: sidebarWorkspaces.sidebarState.isHidden,
				})),
		[collections],
	);

	const { workspaces: hostWorkspaces } = useHostWorkspaces();

	return useMemo(() => {
		const workspaceIds = new Set(
			hostWorkspaces.map((workspace) => workspace.id),
		);
		// Local-state rows only count when the workspace still exists (the old
		// query inner-joined against the workspaces table for the same reason).
		const localStateWorkspaces = localStateRows.filter((workspace) =>
			workspaceIds.has(workspace.id),
		);
		const sidebarProjectIds = new Set(
			sidebarProjects.map((project) => project.projectId),
		);
		const localStateWorkspaceIds = new Set(
			localStateWorkspaces.map((workspace) => workspace.id),
		);
		const visibleIds = new Set<string>();

		for (const workspace of localStateWorkspaces) {
			if (getSidebarWorkspaceIsHidden(workspace)) continue;
			if (!sidebarProjectIds.has(workspace.projectId)) continue;
			visibleIds.add(workspace.id);
		}

		for (const workspace of hostWorkspaces) {
			if (workspace.type !== "main") continue;
			if (
				isAutoIncludedLocalMainWorkspace(workspace, {
					localStateWorkspaceIds,
					sidebarProjectIds,
					machineId,
				})
			) {
				visibleIds.add(workspace.id);
			}
		}

		return visibleIds;
	}, [sidebarProjects, localStateRows, hostWorkspaces, machineId]);
}
