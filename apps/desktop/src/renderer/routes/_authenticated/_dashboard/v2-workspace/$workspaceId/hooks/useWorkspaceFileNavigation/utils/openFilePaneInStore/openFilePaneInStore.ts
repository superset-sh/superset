import type { WorkspaceStore } from "@superset/panes";
import type { StoreApi } from "zustand/vanilla";
import type {
	FilePaneData,
	FilePosition,
	PaneViewerData,
} from "../../../../types";

export function openFilePaneInStore(
	store: StoreApi<WorkspaceStore<PaneViewerData>>,
	filePath: string,
	openInNewTab?: boolean,
	position?: FilePosition,
): void {
	const pendingPosition =
		position && Number.isFinite(position.line)
			? {
					line: Math.max(1, Math.trunc(position.line)),
					column:
						position.column !== undefined && Number.isFinite(position.column)
							? Math.max(1, Math.trunc(position.column))
							: undefined,
				}
			: undefined;
	const locationData = pendingPosition
		? { pendingPosition, viewId: "code", forceViewId: undefined }
		: {};
	const data: FilePaneData = { filePath, mode: "editor", ...locationData };
	const state = store.getState();
	if (openInNewTab) {
		state.addTab({ panes: [{ kind: "file", data }] });
		return;
	}
	for (const tab of state.tabs) {
		for (const pane of Object.values(tab.panes)) {
			if (
				pane.kind !== "file" ||
				(pane.data as FilePaneData).filePath !== filePath
			)
				continue;
			if (pendingPosition)
				state.setPaneData({
					paneId: pane.id,
					data: { ...pane.data, ...locationData },
				});
			state.setActiveTab(tab.id);
			state.setActivePane({ tabId: tab.id, paneId: pane.id });
			return;
		}
	}
	state.openPane({ pane: { kind: "file", data } });
}
