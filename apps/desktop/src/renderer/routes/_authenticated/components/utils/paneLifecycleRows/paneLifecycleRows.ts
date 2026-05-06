import type { Pane, WorkspaceState } from "@superset/panes";

export interface PaneLifecycleRow {
	workspaceId: unknown;
	paneLayout: unknown;
}

export interface RemovedPaneLocation {
	id: string;
	workspaceId: string;
}

export function extractWorkspaceIds(rows: PaneLifecycleRow[]): Set<string> {
	const workspaceIds = new Set<string>();
	for (const row of rows) {
		if (typeof row.workspaceId === "string") {
			workspaceIds.add(row.workspaceId);
		}
	}
	return workspaceIds;
}

export function extractPaneLocations(
	rows: PaneLifecycleRow[],
	getTrackedPaneId: (pane: Pane<unknown>) => string | null,
): Map<string, string> {
	const locations = new Map<string, string>();

	for (const row of rows) {
		if (typeof row.workspaceId !== "string") continue;

		const layout = row.paneLayout as WorkspaceState<unknown> | undefined;
		if (!layout?.tabs) continue;

		for (const tab of layout.tabs) {
			for (const pane of Object.values(tab.panes)) {
				const trackedPaneId = getTrackedPaneId(pane);
				if (trackedPaneId) {
					locations.set(trackedPaneId, row.workspaceId);
				}
			}
		}
	}

	return locations;
}

export function extractPaneIds(
	rows: PaneLifecycleRow[],
	getTrackedPaneId: (pane: Pane<unknown>) => string | null,
): Set<string> {
	const ids = new Set<string>();

	for (const row of rows) {
		const layout = row.paneLayout as WorkspaceState<unknown> | undefined;
		if (!layout?.tabs) continue;

		for (const tab of layout.tabs) {
			for (const pane of Object.values(tab.panes)) {
				const trackedPaneId = getTrackedPaneId(pane);
				if (trackedPaneId) {
					ids.add(trackedPaneId);
				}
			}
		}
	}

	return ids;
}

export function getRemovedPaneLocations({
	previousLocations,
	currentLocations,
	currentWorkspaceIds,
}: {
	previousLocations: Map<string, string>;
	currentLocations: Map<string, string>;
	currentWorkspaceIds: Set<string>;
}): RemovedPaneLocation[] {
	const removed: RemovedPaneLocation[] = [];

	for (const [id, workspaceId] of previousLocations) {
		if (currentLocations.has(id)) continue;
		// A missing owner row means the collection snapshot is not authoritative
		// for this pane. This happens during org/provider churn and can happen
		// briefly after laptop sleep/wake. Intentional sidebar-row removals clean
		// up their pane runtimes before deleting the row.
		if (!currentWorkspaceIds.has(workspaceId)) continue;
		removed.push({ id, workspaceId });
	}

	return removed;
}
