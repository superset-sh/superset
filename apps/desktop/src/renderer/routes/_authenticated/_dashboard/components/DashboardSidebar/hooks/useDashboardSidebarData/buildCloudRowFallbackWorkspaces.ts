import type { SelectV2Workspace } from "@superset/db/schema";
import { getVisibleSidebarWorkspaces } from "renderer/routes/_authenticated/providers/CollectionsProvider/dashboardSidebarLocal";
import type { InFlightEntry } from "renderer/stores/workspace-creates";
import type { DashboardSidebarWorkspace } from "../../types";

// Sits above every real workspace so the pending row lines up with the real
// row, which is inserted via getPrependTabOrder.
const PENDING_WORKSPACE_TAB_ORDER = Number.MIN_SAFE_INTEGER;

export interface CloudRowFallbackHost {
	machineId: string;
	isOnline: boolean;
}

export interface CloudRowFallbackLocalState {
	sidebarState: {
		projectId: string;
		tabOrder: number;
		sectionId: string | null;
		isHidden?: boolean;
	};
}

export interface CloudRowFallbackWorkspace {
	id: string;
	projectId: string;
	hostId: string;
	type: SelectV2Workspace["type"];
	hostIsOnline: boolean;
	name: string;
	branch: string;
	createdAt: Date;
	updatedAt: Date;
	tabOrder: number;
	sectionId: string | null;
	isHidden: boolean;
	creationStatus: DashboardSidebarWorkspace["creationStatus"];
}

// Cloud-row fallback: when workspaces.create has resolved on the host service
// but Electric hasn't yet delivered the v2Workspaces row, surface the cloud row
// cached on the in-flight entry so the sidebar renders the workspace. The
// `creationStatus` is carried through so downstream components can still show
// the "Creating…" indicator during the fallback window — without it the row
// paints as a fully-synced workspace until Electric catches up.
export function buildCloudRowFallbackWorkspaces({
	inFlightEntries,
	hosts,
	localStateWorkspaceIds,
	getWorkspaceLocalState,
}: {
	inFlightEntries: readonly InFlightEntry[];
	hosts: readonly CloudRowFallbackHost[];
	localStateWorkspaceIds: ReadonlySet<string>;
	getWorkspaceLocalState: (
		workspaceId: string,
	) => CloudRowFallbackLocalState | undefined;
}): CloudRowFallbackWorkspace[] {
	if (inFlightEntries.length === 0) return [];
	const hostByMachineId = new Map(hosts.map((host) => [host.machineId, host]));
	const rows: CloudRowFallbackWorkspace[] = inFlightEntries.flatMap((entry) => {
		const cloudRow = entry.cloudRow;
		if (!cloudRow) return [];
		// Electric already delivered; let the live query own this row.
		if (localStateWorkspaceIds.has(cloudRow.id)) return [];
		const localState = getWorkspaceLocalState(cloudRow.id);
		const host = hostByMachineId.get(cloudRow.hostId);
		return [
			{
				id: cloudRow.id,
				projectId: localState?.sidebarState.projectId ?? cloudRow.projectId,
				hostId: cloudRow.hostId,
				type: cloudRow.type,
				hostIsOnline: host?.isOnline ?? false,
				name: cloudRow.name,
				branch: cloudRow.branch,
				createdAt: cloudRow.createdAt,
				updatedAt: cloudRow.updatedAt,
				tabOrder:
					localState?.sidebarState.tabOrder ?? PENDING_WORKSPACE_TAB_ORDER,
				sectionId: localState?.sidebarState.sectionId ?? null,
				isHidden: localState?.sidebarState.isHidden ?? false,
				creationStatus:
					entry.state === "creating" ? ("creating" as const) : undefined,
			},
		];
	});
	return getVisibleSidebarWorkspaces(rows);
}
