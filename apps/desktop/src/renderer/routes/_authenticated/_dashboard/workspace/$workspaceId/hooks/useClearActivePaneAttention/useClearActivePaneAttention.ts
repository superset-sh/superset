import type { WorkspaceStore } from "@superset/panes";
import { useEffect } from "react";
import { usePaneNotificationStatus } from "renderer/hooks/host-service/useNotificationStatus";
import { useTerminalAgentBindings } from "renderer/hooks/host-service/useTerminalAgentBindings";
import { useWorkspace } from "renderer/routes/_authenticated/_dashboard/workspace/providers/WorkspaceProvider";
import {
	getNotificationSourcesForPane,
	useNotificationStore,
} from "renderer/stores/notifications";
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
	const activePaneStatus = usePaneNotificationStatus(workspace.id, activePane);
	const markTerminalSeen = useNotificationStore(
		(state) => state.markTerminalSeen,
	);
	const bindings = useTerminalAgentBindings(workspace.id);

	useEffect(() => {
		if (activePaneStatus !== "review") return;
		for (const source of getNotificationSourcesForPane(activePane)) {
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
