import {
	type PlacementContext,
	selectWorktreesToPlace,
	type WorkspaceForPlacement,
} from "renderer/routes/_authenticated/components/AgentHooks/hooks/usePlaceWorktreesInSidebar";

interface UnsettledProjectsInput {
	hostWorkspaces: readonly WorkspaceForPlacement[];
	/** Cloud rows with the project the cloud list files them under. */
	cloudRows: Iterable<{ id: string; projectId: string | null }>;
	/** Every workspace a host or the cloud list reports. */
	knownWorkspaceIds: ReadonlySet<string>;
	/** Every placement row, hidden ones included. */
	placements: readonly {
		workspaceId: string;
		projectId: string | null;
		isHidden: boolean;
	}[];
	/** Every host's latest workspace list was a live answer. */
	allHostsLive: boolean;
	placementContext: PlacementContext;
}

/**
 * Projects that can hold a workspace the sidebar does not show yet:
 * - a host workspace that the placement reconciler will place,
 * - a cloud row whose placement row is missing or files it elsewhere,
 * - while some host has not answered live, a visible placement row whose
 *   workspace no source reports. With every host live, such a row is
 *   stale (archived outside this app) and does not count.
 */
export function collectUnsettledProjectIds({
	hostWorkspaces,
	cloudRows,
	knownWorkspaceIds,
	placements,
	allHostsLive,
	placementContext,
}: UnsettledProjectsInput): Set<string> {
	const projectIds = new Set<string>();
	const placedProjectIdById = new Map(
		placements.map((placement) => [placement.workspaceId, placement.projectId]),
	);
	for (const workspace of selectWorktreesToPlace(
		hostWorkspaces,
		new Set(placedProjectIdById.keys()),
		placementContext,
	)) {
		if (workspace.projectId !== null) projectIds.add(workspace.projectId);
	}
	for (const row of cloudRows) {
		if (row.projectId === null) continue;
		if (placedProjectIdById.get(row.id) !== row.projectId) {
			projectIds.add(row.projectId);
		}
	}
	if (!allHostsLive) {
		for (const placement of placements) {
			if (
				placement.projectId !== null &&
				!placement.isHidden &&
				!knownWorkspaceIds.has(placement.workspaceId)
			) {
				projectIds.add(placement.projectId);
			}
		}
	}
	return projectIds;
}
