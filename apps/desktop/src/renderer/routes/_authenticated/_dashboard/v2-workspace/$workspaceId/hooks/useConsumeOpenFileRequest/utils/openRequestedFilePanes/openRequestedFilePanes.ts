import type { WorkspaceStore } from "@superset/panes";
import type { StoreApi } from "zustand/vanilla";
import type { OpenFile, PaneViewerData } from "../../../../types";
import type { V2WorkspaceUrlOpenTarget } from "../../../../utils/openUrlInV2Workspace";

export interface OpenFilePanesRequest {
	paths: string[];
	line?: number;
	target: V2WorkspaceUrlOpenTarget;
}

/**
 * Opens one pane per path and returns their ids in order. A single file
 * behaves like a file-tree click: it may replace the unpinned preview pane,
 * and if it is already open in another tab that tab is shown. Several files
 * belong together, so they all land in one destination tab (the active one,
 * or the tab `new-tab` creates for the first file): the tab is re-activated
 * before each open in case an earlier file was already open elsewhere, each
 * pane but the last is pinned or the next open would replace it as the
 * preview, and the request ends on the destination tab. The line applies to
 * the first file, matching `--line`'s single-path contract in the CLI.
 */
export function openRequestedFilePanes(
	store: StoreApi<WorkspaceStore<PaneViewerData>>,
	request: OpenFilePanesRequest,
	openFilePane: OpenFile,
): string[] {
	const paneIds: string[] = [];
	const several = request.paths.length > 1;
	let destinationTabId =
		request.target === "new-tab" ? null : store.getState().activeTabId;
	request.paths.forEach((path, index) => {
		const first = index === 0;
		const last = index === request.paths.length - 1;
		if (several && destinationTabId) {
			const state = store.getState();
			if (state.activeTabId !== destinationTabId)
				state.setActiveTab(destinationTabId);
		}
		openFilePane(
			path,
			first && request.target === "new-tab",
			first && request.line !== undefined ? { line: request.line } : undefined,
		);
		const state = store.getState();
		if (destinationTabId === null) destinationTabId = state.activeTabId;
		const active = state.getActivePane();
		if (!active) return;
		if (several && !last && active.tabId === destinationTabId)
			state.setPanePinned({ paneId: active.pane.id, pinned: true });
		if (!paneIds.includes(active.pane.id)) paneIds.push(active.pane.id);
	});
	if (several && destinationTabId) {
		const state = store.getState();
		if (state.activeTabId !== destinationTabId)
			state.setActiveTab(destinationTabId);
	}
	return paneIds;
}
