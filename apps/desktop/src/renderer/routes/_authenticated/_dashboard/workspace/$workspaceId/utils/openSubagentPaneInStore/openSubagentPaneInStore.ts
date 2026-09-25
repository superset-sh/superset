import type { WorkspaceStore } from "@superset/panes";
import type { StoreApi } from "zustand/vanilla";
import {
	type PaneViewerData,
	SUBAGENT_PANE_KIND,
	type SubagentPaneData,
} from "../../types";
import { focusOrOpenPane } from "../focusOrOpenPane";

/**
 * Focus the pane showing this subagent's transcript, creating one when none
 * exists. One pane per child: a second open for the same child focuses it.
 */
export function openSubagentPaneInStore(
	store: StoreApi<WorkspaceStore<PaneViewerData>>,
	data: SubagentPaneData,
): void {
	focusOrOpenPane<SubagentPaneData>(
		store,
		SUBAGENT_PANE_KIND,
		(pane) =>
			pane.terminalId === data.terminalId &&
			pane.subagentId === data.subagentId,
		data,
	);
}
