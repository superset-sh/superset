import type { SelectV2Workspace } from "@superset/db/schema";
import {
	getVisibleSidebarWorkspaces,
	type WorkspaceLocalStateRow,
} from "renderer/routes/_authenticated/providers/CollectionsProvider/dashboardSidebarLocal";
import type { InFlightEntry } from "renderer/stores/workspace-creates";

// Sits above every real workspace so the pending row lines up with the real one,
// which is inserted via getPrependTabOrder.
export const PENDING_WORKSPACE_TAB_ORDER = Number.MIN_SAFE_INTEGER;

export interface CloudRowFallbackHostRow {
	machineId: string;
	isOnline: boolean;
}

export interface CloudRowFallbackWorkspaceRow {
	id: string;
	projectId: string;
	hostId: string;
	type: SelectV2Workspace["type"];
	hostIsOnline: boolean;
	name: string;
	branch: string;
	taskId: string | null;
	createdAt: Date;
	updatedAt: Date;
	tabOrder: number;
	sectionId: string | null;
	isHidden: boolean;
}

export interface ComputeCloudRowFallbackWorkspacesArgs {
	inFlightEntries: ReadonlyArray<InFlightEntry>;
	hosts: ReadonlyArray<CloudRowFallbackHostRow>;
	/** Workspace ids already surfaced by the synced live query. */
	syncedWorkspaceIds: ReadonlySet<string>;
	getLocalState: (workspaceId: string) => WorkspaceLocalStateRow | undefined;
}

/**
 * Cloud-row fallback: when `workspaces.create` has resolved on the host
 * service but Electric hasn't yet delivered the v2Workspaces row, surface
 * the cloud row cached on the in-flight entry so the sidebar renders the
 * workspace as fully synced.
 *
 * Skips entries whose sidebar local-state row is missing — without the row
 * the user has no way to dismiss the fallback workspace (issue #4555). The
 * happy path always inserts the local-state row before yielding to React,
 * so the only way to reach the missing-localState branch is after an
 * explicit `removeWorkspaceFromSidebar`.
 */
export function computeCloudRowFallbackWorkspaces({
	inFlightEntries,
	hosts,
	syncedWorkspaceIds,
	getLocalState,
}: ComputeCloudRowFallbackWorkspacesArgs): CloudRowFallbackWorkspaceRow[] {
	if (inFlightEntries.length === 0) return [];

	const hostByMachineId = new Map(hosts.map((host) => [host.machineId, host]));

	const rows: CloudRowFallbackWorkspaceRow[] = inFlightEntries.flatMap(
		(entry) => {
			const cloudRow = entry.cloudRow;
			if (!cloudRow) return [];
			// Electric already delivered; let the live query own this row.
			if (syncedWorkspaceIds.has(cloudRow.id)) return [];
			const localState = getLocalState(cloudRow.id);
			// Sidebar entry was explicitly removed (or never inserted); don't
			// resurrect the workspace from in-flight memory.
			if (!localState) return [];
			const host = hostByMachineId.get(cloudRow.hostId);
			return [
				{
					id: cloudRow.id,
					projectId: localState.sidebarState.projectId,
					hostId: cloudRow.hostId,
					type: cloudRow.type,
					hostIsOnline: host?.isOnline ?? false,
					name: cloudRow.name,
					branch: cloudRow.branch,
					taskId: cloudRow.taskId,
					createdAt: cloudRow.createdAt,
					updatedAt: cloudRow.updatedAt,
					tabOrder:
						localState.sidebarState.tabOrder ?? PENDING_WORKSPACE_TAB_ORDER,
					sectionId: localState.sidebarState.sectionId ?? null,
					isHidden: localState.sidebarState.isHidden ?? false,
				},
			];
		},
	);

	return getVisibleSidebarWorkspaces(rows);
}
