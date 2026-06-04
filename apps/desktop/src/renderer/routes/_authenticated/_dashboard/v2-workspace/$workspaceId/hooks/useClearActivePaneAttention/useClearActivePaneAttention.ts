import type { WorkspaceStore } from "@superset/panes";
import { useEffect } from "react";
import { useWorkspace } from "renderer/routes/_authenticated/_dashboard/v2-workspace/providers/WorkspaceProvider";
import {
	getV2NotificationSourcesForPane,
	useV2NotificationStore,
	useV2PaneNotificationStatus,
} from "renderer/stores/v2-notifications";
import { useStore } from "zustand";
import type { StoreApi } from "zustand/vanilla";
import type { PaneViewerData } from "../../types";

export function useClearActivePaneAttention({
	store,
}: {
	store: StoreApi<WorkspaceStore<PaneViewerData>>;
}): void {
	const { workspace } = useWorkspace();
	const activePane = useStore(store, (state) => {
		const tab = state.tabs.find(
			(candidate) => candidate.id === state.activeTabId,
		);
		return tab?.activePaneId ? tab.panes[tab.activePaneId] : undefined;
	});
	const activePaneStatus = useV2PaneNotificationStatus(
		workspace.id,
		activePane,
	);
	const clearSourceAttention = useV2NotificationStore(
		(state) => state.clearSourceAttention,
	);

	useEffect(() => {
		if (activePaneStatus !== "review") return;
		for (const source of getV2NotificationSourcesForPane(activePane)) {
			clearSourceAttention(source, workspace.id);
		}
	}, [activePane, activePaneStatus, clearSourceAttention, workspace.id]);
}
