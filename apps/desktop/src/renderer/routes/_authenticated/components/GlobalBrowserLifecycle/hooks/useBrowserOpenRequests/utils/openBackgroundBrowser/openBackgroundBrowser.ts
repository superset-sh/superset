import { createWorkspaceStore, type WorkspaceState } from "@superset/panes";
import { preserveLocalPaneSelection } from "renderer/routes/_authenticated/_dashboard/workspace/$workspaceId/hooks/useWorkspacePaneLayout/utils/preserveLocalPaneSelection";
import type { PaneViewerData } from "renderer/routes/_authenticated/_dashboard/workspace/$workspaceId/types";
import {
	openUrlInWorkspace,
	type WorkspaceUrlOpenTarget,
} from "renderer/routes/_authenticated/_dashboard/workspace/$workspaceId/utils/openUrlInWorkspace";
import type { AppCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider/collections";
import { applyRememberedPaneSelection } from "renderer/stores/pane-selection";

export function openBackgroundBrowser({
	collections,
	workspaceId,
	url,
	target,
}: {
	collections: Pick<AppCollections, "workspaceLocalState">;
	workspaceId: string;
	url: string;
	target: WorkspaceUrlOpenTarget;
}): string {
	const row = collections.workspaceLocalState.get(workspaceId);
	if (!row)
		throw new Error(`Workspace ${workspaceId} has no local pane layout`);
	const previous = applyRememberedPaneSelection(
		workspaceId,
		row.paneLayout as WorkspaceState<PaneViewerData>,
	);
	const store = createWorkspaceStore<PaneViewerData>({
		initialState: previous,
	});
	openUrlInWorkspace({ store, url, target });
	const next = store.getState();
	const tab = next.tabs.find((tab) => tab.id === next.activeTabId);
	const paneId = tab?.activePaneId;
	if (!paneId) throw new Error("Browser open did not create a pane");
	const paneLayout = preserveLocalPaneSelection(previous, {
		version: next.version,
		tabs: next.tabs,
		activeTabId: next.activeTabId,
	});
	collections.workspaceLocalState.update(workspaceId, (draft) => {
		draft.paneLayout = paneLayout;
	});
	return paneId;
}
