import { eq } from "@tanstack/db";
import { useLiveQuery } from "@tanstack/react-db";
import { useEffect } from "react";
import { useDashboardSidebarState } from "renderer/routes/_authenticated/hooks/useDashboardSidebarState";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";

/**
 * Backfills `v2WorkspaceLocalState` entries for workspaces on this device that
 * have none. Only fills missing rows — a workspace the user explicitly hid
 * keeps its row with `isHidden: true` and is left alone.
 */
export function useAutoAddLocalWorkspacesToSidebar(): void {
	const collections = useCollections();
	const { machineId } = useLocalHostService();
	const { ensureWorkspaceInSidebar } = useDashboardSidebarState();

	const { data: localWorkspaces = [], isReady: workspacesReady } = useLiveQuery(
		(query) =>
			query
				.from({ workspaces: collections.v2Workspaces })
				.where(({ workspaces }) => eq(workspaces.hostId, machineId))
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
