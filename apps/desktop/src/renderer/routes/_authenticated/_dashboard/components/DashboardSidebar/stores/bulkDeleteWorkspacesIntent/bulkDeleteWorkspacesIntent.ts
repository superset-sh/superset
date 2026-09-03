import { create } from "zustand";
import type { DashboardSidebarWorkspace } from "../../types";

/**
 * Drives the single sidebar-level bulk delete dialog
 * (DashboardSidebarBulkDeleteMount). The destroy pipeline archives each row
 * as its delete starts, so a dialog mounted under a workspace row (the bulk
 * context menu) or under the selection toolbar (which unmounts when the
 * selection empties or the sidebar collapses) disappears mid-flight. Every
 * entry point requests through this store instead; the targets stay latched
 * until the dialog closes so a failure pane can still surface after the rows
 * are gone. `requestId` keys the dialog so each request starts from fresh
 * state, and `close` takes it so a stale callback from a superseded request
 * can't clear a newer one.
 */
interface BulkDeleteWorkspacesIntentState {
	requestId: number;
	targets: DashboardSidebarWorkspace[];
	request: (targets: DashboardSidebarWorkspace[]) => void;
	close: (requestId: number) => void;
}

export const useBulkDeleteWorkspacesIntent =
	create<BulkDeleteWorkspacesIntentState>((set) => ({
		requestId: 0,
		targets: [],
		request: (targets) =>
			set((state) =>
				targets.length === 0
					? state
					: { requestId: state.requestId + 1, targets },
			),
		close: (requestId) =>
			set((state) => (state.requestId === requestId ? { targets: [] } : state)),
	}));
