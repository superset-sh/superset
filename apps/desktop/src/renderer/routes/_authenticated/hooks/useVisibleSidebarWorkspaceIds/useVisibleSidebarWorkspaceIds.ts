import { eq } from "@tanstack/db";
import { useLiveQuery } from "@tanstack/react-db";
import { useMemo } from "react";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import {
	getAutomationRunWorkspaceIds,
	getSidebarWorkspaceIsHidden,
	isAutoIncludedLocalMainWorkspace,
	isLegacyAutomationRunWorkspace,
} from "renderer/routes/_authenticated/providers/CollectionsProvider/dashboardSidebarLocal";
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

	const { data: sidebarProjects = [] } = useLiveQuery(
		(q) =>
			q
				.from({ sidebarProjects: collections.v2SidebarProjects })
				.innerJoin(
					{ projects: collections.v2Projects },
					({ sidebarProjects, projects }) =>
						eq(sidebarProjects.projectId, projects.id),
				)
				.select(({ projects }) => ({ id: projects.id })),
		[collections],
	);

	const { data: localStateWorkspaces = [] } = useLiveQuery(
		(q) =>
			q
				.from({ sidebarWorkspaces: collections.v2WorkspaceLocalState })
				.innerJoin(
					{ workspaces: collections.v2Workspaces },
					({ sidebarWorkspaces, workspaces }) =>
						eq(sidebarWorkspaces.workspaceId, workspaces.id),
				)
				.select(({ sidebarWorkspaces, workspaces }) => ({
					id: workspaces.id,
					projectId: sidebarWorkspaces.sidebarState.projectId,
					isHidden: sidebarWorkspaces.sidebarState.isHidden,
					name: workspaces.name,
					branch: workspaces.branch,
					type: workspaces.type,
					taskId: workspaces.taskId,
				})),
		[collections],
	);
	const { data: automationRunWorkspaceRows = [] } = useLiveQuery(
		(q) =>
			q
				.from({ automationRuns: collections.automationRuns })
				.select(({ automationRuns }) => ({
					v2WorkspaceId: automationRuns.v2WorkspaceId,
				})),
		[collections],
	);
	const { data: automationNameRows = [] } = useLiveQuery(
		(q) =>
			q
				.from({ automations: collections.automations })
				.select(({ automations }) => ({
					name: automations.name,
				})),
		[collections],
	);

	const { data: mainWorkspaces = [] } = useLiveQuery(
		(q) =>
			q
				.from({ workspaces: collections.v2Workspaces })
				.where(({ workspaces }) => eq(workspaces.type, "main"))
				.select(({ workspaces }) => ({
					id: workspaces.id,
					projectId: workspaces.projectId,
					hostId: workspaces.hostId,
				})),
		[collections],
	);

	return useMemo(() => {
		const sidebarProjectIds = new Set(
			sidebarProjects.map((project) => project.id),
		);
		const automationRunWorkspaceIds = getAutomationRunWorkspaceIds(
			automationRunWorkspaceRows,
		);
		const automationNames = new Set(
			automationNameRows.map((automation) => automation.name),
		);
		const localStateWorkspaceIds = new Set(
			localStateWorkspaces
				.filter(
					(workspace) =>
						!automationRunWorkspaceIds.has(workspace.id) &&
						!isLegacyAutomationRunWorkspace(workspace, automationNames),
				)
				.map((workspace) => workspace.id),
		);
		const visibleIds = new Set<string>();

		for (const workspace of localStateWorkspaces) {
			if (automationRunWorkspaceIds.has(workspace.id)) continue;
			if (isLegacyAutomationRunWorkspace(workspace, automationNames)) continue;
			if (getSidebarWorkspaceIsHidden(workspace)) continue;
			if (!sidebarProjectIds.has(workspace.projectId)) continue;
			visibleIds.add(workspace.id);
		}

		for (const workspace of mainWorkspaces) {
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
	}, [
		sidebarProjects,
		localStateWorkspaces,
		automationRunWorkspaceRows,
		automationNameRows,
		mainWorkspaces,
		machineId,
	]);
}
