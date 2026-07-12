import type { WorkspaceStore } from "@superset/panes";
import { useEffect } from "react";
import { useTerminalAgentBindings } from "renderer/hooks/host-service/useTerminalAgentBindings";
import { useV2PaneNotificationStatus } from "renderer/hooks/host-service/useV2NotificationStatus";
import { useWorkspace } from "renderer/routes/_authenticated/_dashboard/v2-workspace/providers/WorkspaceProvider";
import {
	getV2NotificationSourcesForPane,
	useV2NotificationStore,
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
	const markTerminalSeen = useV2NotificationStore(
		(state) => state.markTerminalSeen,
	);
	const bindings = useTerminalAgentBindings(workspace.id);

	useEffect(() => {
		if (activePaneStatus !== "review") return;
		for (const source of getV2NotificationSourcesForPane(activePane)) {
			if (source.type !== "terminal") continue;
			// Seen marks are host-clock only: mark "seen through the binding's
			// last event". Mixing in the renderer clock would poison the
			// monotonic comparison whenever the clocks drift.
			const binding = bindings.get(source.id);
			if (!binding) continue;
			markTerminalSeen(source.id, binding.lastEventAt);
		}
	}, [activePane, activePaneStatus, bindings, markTerminalSeen]);
}
