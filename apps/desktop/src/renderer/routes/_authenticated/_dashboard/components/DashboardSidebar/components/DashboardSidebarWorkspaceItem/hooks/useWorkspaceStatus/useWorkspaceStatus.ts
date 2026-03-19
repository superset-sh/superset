import { useTabsStore } from "renderer/stores/tabs/store";
import { extractPaneIdsFromLayout } from "renderer/stores/tabs/utils";
import type { ActivePaneStatus } from "shared/tabs-types";
import { getHighestPriorityStatus } from "shared/tabs-types";

/**
 * Derives the aggregate agent lifecycle status for a workspace
 * by reading real pane statuses from the tabs store.
 *
 * Mirrors the V1 sidebar logic in WorkspaceListItem.
 */
export function useWorkspaceStatus(
	workspaceId: string,
): ActivePaneStatus | null {
	return useTabsStore((state) => {
		function* paneStatuses() {
			for (const tab of state.tabs) {
				if (tab.workspaceId !== workspaceId) continue;
				for (const paneId of extractPaneIdsFromLayout(tab.layout)) {
					yield state.panes[paneId]?.status;
				}
			}
		}
		return getHighestPriorityStatus(paneStatuses());
	});
}
