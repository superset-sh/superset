import { createWorkspaceStore, type WorkspaceState } from "@superset/panes";
import { preserveLocalPaneSelection } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/useV2WorkspacePaneLayout/utils/preserveLocalPaneSelection";
import type { PaneViewerData } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/types";
import {
	openUrlInV2Workspace,
	type V2WorkspaceUrlOpenTarget,
} from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/utils/openUrlInV2Workspace";
import type { AppCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider/collections";
import { getV2PaneLayoutStore } from "renderer/stores/v2-pane-layout-stores";
import {
	applyRememberedV2PaneSelection,
	rememberV2PaneSelection,
} from "renderer/stores/v2-pane-selection";

export function openBackgroundBrowser({
	collections,
	workspaceId,
	url,
	target,
	activate = false,
}: {
	collections: Pick<AppCollections, "v2WorkspaceLocalState">;
	workspaceId: string;
	url: string;
	target: V2WorkspaceUrlOpenTarget;
	activate?: boolean;
}): string {
	const row = collections.v2WorkspaceLocalState.get(workspaceId);
	if (!row)
		throw new Error(`Workspace ${workspaceId} has no local pane layout`);
	const previous = applyRememberedV2PaneSelection(
		workspaceId,
		row.paneLayout as WorkspaceState<PaneViewerData>,
	);
	const store = createWorkspaceStore<PaneViewerData>({
		initialState: previous,
	});
	openUrlInV2Workspace({ store, url, target });
	const next = store.getState();
	const tab = next.tabs.find((tab) => tab.id === next.activeTabId);
	const paneId = tab?.activePaneId;
	if (!paneId) throw new Error("Browser open did not create a pane");
	const nextLayout: WorkspaceState<PaneViewerData> = {
		version: next.version,
		tabs: next.tabs,
		activeTabId: next.activeTabId,
	};
	const paneLayout = activate
		? nextLayout
		: preserveLocalPaneSelection(previous, nextLayout);
	collections.v2WorkspaceLocalState.update(workspaceId, (draft) => {
		draft.paneLayout = paneLayout;
	});
	if (activate) {
		rememberV2PaneSelection(workspaceId, paneLayout);
		getV2PaneLayoutStore(workspaceId)?.getState().replaceState(paneLayout);
	}
	return paneId;
}
