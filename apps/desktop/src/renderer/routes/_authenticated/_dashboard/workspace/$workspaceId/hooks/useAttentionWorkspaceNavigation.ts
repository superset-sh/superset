import type { UseNavigateResult } from "@tanstack/react-router";
import { useCallback, useMemo } from "react";
import { useHotkey } from "renderer/hotkeys";
import {
	type ElectronRouterOutputs,
	electronTrpc,
} from "renderer/lib/electron-trpc";
import { navigateToWorkspace } from "renderer/routes/_authenticated/_dashboard/utils/workspace-navigation";
import { useTabsStore } from "renderer/stores/tabs/store";
import type { Tab } from "renderer/stores/tabs/types";
import { extractPaneIdsFromLayout } from "renderer/stores/tabs/utils";
import { getHighestPriorityStatus, type Pane } from "shared/tabs-types";
import { findNeighborInSet } from "shared/utils/neighbor-in-set";

type GroupedWorkspaces = ElectronRouterOutputs["workspaces"]["getAllGrouped"];

/**
 * Flattens the grouped sidebar data into:
 *   - `orderedIds`: workspace IDs in the same visual order as the sidebar
 *   - `unreadIds`:  the subset whose `isUnread` flag is set
 */
function indexGrouped(grouped: GroupedWorkspaces | undefined): {
	orderedIds: string[];
	unreadIds: Set<string>;
} {
	const orderedIds: string[] = [];
	const unreadIds = new Set<string>();
	if (!grouped) return { orderedIds, unreadIds };

	for (const group of grouped) {
		for (const item of group.topLevelItems) {
			if (item.kind === "workspace") {
				orderedIds.push(item.id);
				continue;
			}
			const section = group.sections.find((s) => s.id === item.id);
			if (!section) continue;
			for (const ws of section.workspaces) {
				orderedIds.push(ws.id);
			}
		}
		for (const ws of group.workspaces) {
			if (ws.isUnread) unreadIds.add(ws.id);
		}
		for (const section of group.sections) {
			for (const ws of section.workspaces) {
				if (ws.isUnread) unreadIds.add(ws.id);
			}
		}
	}

	return { orderedIds, unreadIds };
}

/**
 * Set of workspace IDs that are "demanding attention": unread (blue dot),
 * awaiting review (green dot), or asking permission (red dot). Excludes
 * `working` (amber) since the user isn't blocked on those.
 */
export function computeAttentionWorkspaceIds(
	unreadIds: Set<string>,
	tabs: Tab[],
	panes: Record<string, Pane>,
): Set<string> {
	const attention = new Set<string>(unreadIds);

	const statusesByWorkspace = new Map<string, Array<Pane["status"]>>();
	for (const tab of tabs) {
		const bucket = statusesByWorkspace.get(tab.workspaceId) ?? [];
		for (const paneId of extractPaneIdsFromLayout(tab.layout)) {
			bucket.push(panes[paneId]?.status);
		}
		statusesByWorkspace.set(tab.workspaceId, bucket);
	}

	for (const [workspaceId, statuses] of statusesByWorkspace) {
		const highest = getHighestPriorityStatus(statuses);
		if (highest === "review" || highest === "permission") {
			attention.add(workspaceId);
		}
	}

	return attention;
}

export function useAttentionWorkspaceNavigation(
	currentWorkspaceId: string,
	navigate: UseNavigateResult<string>,
) {
	const groupedQuery = electronTrpc.workspaces.getAllGrouped.useQuery();

	const { orderedIds, unreadIds } = useMemo(
		() => indexGrouped(groupedQuery.data),
		[groupedQuery.data],
	);

	const resolveTarget = useCallback(
		(direction: "next" | "prev") => {
			if (orderedIds.length === 0) return null;
			const { tabs, panes } = useTabsStore.getState();
			const attentionSet = computeAttentionWorkspaceIds(unreadIds, tabs, panes);
			return findNeighborInSet(
				orderedIds,
				currentWorkspaceId,
				attentionSet,
				direction,
			);
		},
		[orderedIds, unreadIds, currentWorkspaceId],
	);

	useHotkey("PREV_ATTENTION_WORKSPACE", () => {
		const target = resolveTarget("prev");
		if (target) {
			useTabsStore.getState().clearWorkspaceAttentionStatus(target);
			navigateToWorkspace(target, navigate);
		}
	});
	useHotkey("NEXT_ATTENTION_WORKSPACE", () => {
		const target = resolveTarget("next");
		if (target) {
			useTabsStore.getState().clearWorkspaceAttentionStatus(target);
			navigateToWorkspace(target, navigate);
		}
	});
}
