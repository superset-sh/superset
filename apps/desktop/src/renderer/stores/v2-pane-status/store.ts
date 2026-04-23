import { getHighestPriorityStatus, type PaneStatus } from "shared/tabs-types";
import { create } from "zustand";

/**
 * Per-pane status for v2 panes. V2 panes live in the `@superset/panes`
 * workspace-scoped store and have no `status` field on them; this store
 * parallels that layout data with agent-lifecycle state so sidebar icons
 * and tab chrome can indicate working/permission/review per pane and per
 * workspace.
 *
 * Separate from the v1 `useTabsStore` because v2 paneIds aren't registered
 * there — v2's derivation has to iterate this store directly and filter
 * by workspaceId.
 */

interface PaneStatusEntry {
	workspaceId: string;
	status: PaneStatus;
}

interface V2PaneStatusState {
	statuses: Record<string, PaneStatusEntry>;
	setPaneStatus: (
		paneId: string,
		workspaceId: string,
		status: PaneStatus,
	) => void;
	clearPaneStatus: (paneId: string) => void;
	clearWorkspaceStatuses: (workspaceId: string) => void;
	/**
	 * Clear post-completion attention statuses (review) for a workspace.
	 * Mirrors v1's `resetWorkspaceStatus` — called when the user navigates
	 * into the workspace, since they're now looking at it and don't need
	 * the sidebar indicator anymore. Leaves `working` and `permission`
	 * untouched because those are still-active states.
	 */
	clearWorkspaceAttention: (workspaceId: string) => void;
}

export const useV2PaneStatusStore = create<V2PaneStatusState>()((set) => ({
	statuses: {},
	setPaneStatus: (paneId, workspaceId, status) => {
		set((state) => ({
			statuses: {
				...state.statuses,
				[paneId]: { workspaceId, status },
			},
		}));
	},
	clearPaneStatus: (paneId) => {
		set((state) => {
			if (!state.statuses[paneId]) return state;
			const { [paneId]: _removed, ...rest } = state.statuses;
			return { statuses: rest };
		});
	},
	clearWorkspaceStatuses: (workspaceId) => {
		set((state) => {
			const next: Record<string, PaneStatusEntry> = {};
			for (const [paneId, entry] of Object.entries(state.statuses)) {
				if (entry.workspaceId !== workspaceId) {
					next[paneId] = entry;
				}
			}
			return { statuses: next };
		});
	},
	clearWorkspaceAttention: (workspaceId) => {
		set((state) => {
			const next: Record<string, PaneStatusEntry> = {};
			let changed = false;
			for (const [paneId, entry] of Object.entries(state.statuses)) {
				if (entry.workspaceId === workspaceId && entry.status === "review") {
					changed = true;
					continue;
				}
				next[paneId] = entry;
			}
			return changed ? { statuses: next } : state;
		});
	},
}));

/**
 * Derive the highest-priority active status across all panes in a
 * workspace. Returns null when every pane is idle — matches the v1
 * `WorkspaceListItem` derivation shape.
 */
export function selectWorkspaceStatus(workspaceId: string) {
	return (state: V2PaneStatusState) => {
		function* paneStatuses() {
			for (const entry of Object.values(state.statuses)) {
				if (entry.workspaceId === workspaceId) {
					yield entry.status;
				}
			}
		}
		return getHighestPriorityStatus(paneStatuses());
	};
}
