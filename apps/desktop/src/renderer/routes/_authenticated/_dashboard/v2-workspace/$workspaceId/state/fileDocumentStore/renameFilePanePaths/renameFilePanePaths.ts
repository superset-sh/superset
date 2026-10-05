import type { WorkspaceStore } from "@superset/panes";
import type { FsWatchEvent } from "@superset/workspace-fs/client";
import type { StoreApi } from "zustand/vanilla";
import type { FilePaneData, PaneViewerData } from "../../../types";

export function renameFilePanePaths(
	store: StoreApi<WorkspaceStore<PaneViewerData>>,
	event: FsWatchEvent,
): void {
	if (event.kind !== "rename" || !event.oldAbsolutePath) return;
	const state = store.getState();
	for (const tab of state.tabs) {
		for (const pane of Object.values(tab.panes)) {
			if (pane.kind !== "file") continue;
			const data = pane.data as FilePaneData;
			const source = data.filePath;
			if (
				source !== event.oldAbsolutePath &&
				!(
					event.isDirectory === true &&
					source.startsWith(`${event.oldAbsolutePath}/`)
				)
			)
				continue;
			state.setPaneData({
				paneId: pane.id,
				data: {
					...data,
					filePath:
						event.absolutePath + source.slice(event.oldAbsolutePath.length),
				},
			});
		}
	}
}
