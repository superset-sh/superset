import { create } from "zustand";
import {
	type PaneStatus,
	getHighestPriorityStatus,
} from "shared/tabs-types";
import type { ActivePaneStatus } from "shared/tabs-types";

interface V2PaneStatusState {
	/** paneId → current lifecycle status */
	statuses: Record<string, PaneStatus>;
	/** paneId → workspaceId (for workspace-level aggregation) */
	paneWorkspace: Record<string, string>;

	setPaneStatus: (paneId: string, status: PaneStatus) => void;
	registerPanes: (workspaceId: string, paneIds: string[]) => void;
	unregisterWorkspace: (workspaceId: string) => void;
	isV2Pane: (paneId: string) => boolean;
}

export const useV2PaneStatusStore = create<V2PaneStatusState>((set, get) => ({
	statuses: {},
	paneWorkspace: {},

	setPaneStatus: (paneId, status) => {
		const current = get().statuses[paneId];
		if (current === status) return;
		set((s) => ({
			statuses: { ...s.statuses, [paneId]: status },
		}));
	},

	registerPanes: (workspaceId, paneIds) => {
		set((s) => {
			const nextPaneWorkspace = { ...s.paneWorkspace };
			const nextStatuses = { ...s.statuses };

			// Remove stale panes for this workspace
			for (const [existingPaneId, ws] of Object.entries(nextPaneWorkspace)) {
				if (ws === workspaceId && !paneIds.includes(existingPaneId)) {
					delete nextPaneWorkspace[existingPaneId];
					delete nextStatuses[existingPaneId];
				}
			}

			// Add new panes
			for (const paneId of paneIds) {
				if (nextPaneWorkspace[paneId] !== workspaceId) {
					nextPaneWorkspace[paneId] = workspaceId;
				}
				if (!(paneId in nextStatuses)) {
					nextStatuses[paneId] = "idle";
				}
			}

			return { paneWorkspace: nextPaneWorkspace, statuses: nextStatuses };
		});
	},

	unregisterWorkspace: (workspaceId) => {
		set((s) => {
			const nextPaneWorkspace = { ...s.paneWorkspace };
			const nextStatuses = { ...s.statuses };

			for (const [paneId, ws] of Object.entries(nextPaneWorkspace)) {
				if (ws === workspaceId) {
					delete nextPaneWorkspace[paneId];
					delete nextStatuses[paneId];
				}
			}

			return { paneWorkspace: nextPaneWorkspace, statuses: nextStatuses };
		});
	},

	isV2Pane: (paneId) => paneId in get().paneWorkspace,
}));

/**
 * Selector: get the highest-priority status across all panes in a workspace.
 * Returns null if all panes are idle (no indicator needed).
 */
export function selectWorkspaceStatus(
	state: V2PaneStatusState,
	workspaceId: string,
): ActivePaneStatus | null {
	const paneStatuses = Object.entries(state.paneWorkspace)
		.filter(([, ws]) => ws === workspaceId)
		.map(([paneId]) => state.statuses[paneId]);
	return getHighestPriorityStatus(paneStatuses);
}
