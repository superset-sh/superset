import type { DestroyWorkspaceError } from "renderer/hooks/host-service/useDestroyWorkspace";
import { create } from "zustand";
import type { DashboardSidebarWorkspace } from "../../types";

export interface BulkWorkspaceDeleteFailure {
	workspace: DashboardSidebarWorkspace;
	error: DestroyWorkspaceError;
}

/**
 * Where a bulk delete request is: awaiting confirmation, destroying in the
 * background, or showing what could not be deleted.
 */
export type BulkDeleteWorkspacesPhase = "confirm" | "running" | "failed";

/**
 * Drives the single sidebar-level bulk delete dialog
 * (DashboardSidebarBulkDeleteMount). The destroy pipeline archives each row
 * as its delete starts, so a dialog mounted under a workspace row (the bulk
 * context menu) or under the selection toolbar (which unmounts when the
 * selection empties or the sidebar collapses) disappears mid-flight. Every
 * entry point requests through this store instead. The request's phase and
 * failures live here rather than in the dialog because the sidebar itself
 * unmounts when toggled closed: a run that outlives its dialog still needs
 * to surface the failures pane once the sidebar is back, and must not
 * re-ask for confirmation. `requestId` keys the dialog so each request
 * starts from fresh inspection state, and the phase transitions take it so
 * a stale callback from a superseded request can't touch a newer one.
 */
interface BulkDeleteWorkspacesIntentState {
	requestId: number;
	targets: DashboardSidebarWorkspace[];
	phase: BulkDeleteWorkspacesPhase;
	failures: BulkWorkspaceDeleteFailure[];
	request: (targets: DashboardSidebarWorkspace[]) => void;
	markRunning: (requestId: number) => void;
	markFailed: (
		requestId: number,
		failures: BulkWorkspaceDeleteFailure[],
	) => void;
	close: (requestId: number) => void;
}

export const useBulkDeleteWorkspacesIntent =
	create<BulkDeleteWorkspacesIntentState>((set) => ({
		requestId: 0,
		targets: [],
		phase: "confirm",
		failures: [],
		request: (targets) =>
			set((state) =>
				targets.length === 0
					? state
					: {
							requestId: state.requestId + 1,
							targets,
							phase: "confirm",
							failures: [],
						},
			),
		markRunning: (requestId) =>
			set((state) =>
				state.requestId === requestId
					? { phase: "running", failures: [] }
					: state,
			),
		markFailed: (requestId, failures) =>
			set((state) =>
				state.requestId === requestId ? { phase: "failed", failures } : state,
			),
		close: (requestId) =>
			set((state) =>
				state.requestId === requestId
					? { targets: [], phase: "confirm", failures: [] }
					: state,
			),
	}));
