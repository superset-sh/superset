import { and, eq } from "@tanstack/db";
import { useLiveQuery } from "@tanstack/react-db";
import { useEffect } from "react";
import { useDashboardSidebarState } from "renderer/routes/_authenticated/hooks/useDashboardSidebarState";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";

/**
 * Backfills `v2WorkspaceLocalState` rows for workspaces on this device that have
 * none — e.g. ones created via the CLI, which can't write renderer-local sidebar
 * state. A missing row means "never seen here": removing or unpinning a workspace
 * keeps its row with `isHidden: true` (a tombstone), so this never re-pins one the
 * user dismissed.
 *
 * Scoped to `worktree` workspaces. A `main` workspace exists for every project
 * cloned/opened on the device, so backfilling those would force every
 * locally-known project into the sidebar — even ones the user never added. Main
 * workspaces are instead surfaced by the gated `isAutoIncludedLocalMainWorkspace`
 * path, which shows them only when their project is already in the sidebar and
 * never creates a project record.
 */
export function useAutoAddLocalWorkspacesToSidebar(): void {
	const collections = useCollections();
	const { machineId } = useLocalHostService();
	const { ensureWorkspaceInSidebar } = useDashboardSidebarState();

	const { data: localWorkspaces = [], isReady: workspacesReady } = useLiveQuery(
		(query) =>
			query
				.from({ workspaces: collections.v2Workspaces })
				.where(({ workspaces }) =>
					and(
						eq(workspaces.hostId, machineId),
						eq(workspaces.type, "worktree"),
					),
				)
				.select(({ workspaces }) => ({
					id: workspaces.id,
					projectId: workspaces.projectId,
				})),
		[collections, machineId],
	);

	const { data: localStateRows = [], isReady: localStateReady } = useLiveQuery(
		(query) =>
			query
				.from({ state: collections.v2WorkspaceLocalState })
				.select(({ state }) => ({ workspaceId: state.workspaceId })),
		[collections],
	);

	useEffect(() => {
		if (!workspacesReady || !localStateReady) return;

		const knownWorkspaceIds = new Set(
			localStateRows.map((row) => row.workspaceId),
		);

		for (const workspace of localWorkspaces) {
			if (knownWorkspaceIds.has(workspace.id)) continue;
			ensureWorkspaceInSidebar(workspace.id, workspace.projectId);
		}
	}, [
		ensureWorkspaceInSidebar,
		localStateReady,
		localStateRows,
		localWorkspaces,
		workspacesReady,
	]);
}
