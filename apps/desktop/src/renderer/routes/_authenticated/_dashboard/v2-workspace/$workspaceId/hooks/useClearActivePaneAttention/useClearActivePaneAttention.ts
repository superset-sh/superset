import type { WorkspaceStore } from "@superset/panes";
import { useEffect } from "react";
import {
	getV2NotificationSourcesForPane,
	useV2NotificationStore,
	useV2PaneNotificationStatus,
} from "renderer/stores/v2-notifications";
import { useStore } from "zustand";
import type { StoreApi } from "zustand/vanilla";
import type { PaneViewerData } from "../../types";

export function useClearActivePaneAttention({
	workspaceId,
	store,
}: {
	workspaceId: string;
	store: StoreApi<WorkspaceStore<PaneViewerData>>;
}): void {
	const activePane = useStore(store, (state) => {
		const tab = state.tabs.find(
			(candidate) => candidate.id === state.activeTabId,
		);
		return tab?.activePaneId ? tab.panes[tab.activePaneId] : undefined;
	});
	const activePaneStatus = useV2PaneNotificationStatus(workspaceId, activePane);
	const clearSourceAttention = useV2NotificationStore(
		(state) => state.clearSourceAttention,
	);

	useEffect(() => {
		if (activePaneStatus !== "review") return;
		for (const source of getV2NotificationSourcesForPane(activePane)) {
			clearSourceAttention(source, workspaceId);
		}
	}, [activePane, activePaneStatus, clearSourceAttention, workspaceId]);
}
