import { useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { navigateToWorkspace } from "renderer/routes/_authenticated/_dashboard/utils/workspace-navigation";
import { useAppHotkey } from "renderer/stores/hotkeys";
import { useTabsStore } from "renderer/stores/tabs/store";
import { getHighestPriorityStatus } from "shared/tabs-types";
import { findNextAttentionWorkspace } from "./attention-workspace-navigation";

/**
 * Hook for ⌘⌥⇧↑/↓ shortcuts to jump to the next/previous workspace needing attention.
 * A workspace "needs attention" when any of its panes has a non-idle status
 * (permission, working, or review).
 */
export function useAttentionWorkspaceShortcuts(currentWorkspaceId: string) {
	const { data: groups = [] } =
		electronTrpc.workspaces.getAllGrouped.useQuery();
	const navigate = useNavigate();

	const allWorkspaceIds = groups.flatMap((group) => {
		const topLevelWorkspacesById = new Map(
			group.workspaces.map((workspace) => [workspace.id, workspace]),
		);
		const sectionsById = new Map(
			(group.sections ?? []).map((section) => [section.id, section]),
		);

		return group.topLevelItems.flatMap((item) => {
			if (item.kind === "workspace") {
				return topLevelWorkspacesById.has(item.id) ? [item.id] : [];
			}
			return (sectionsById.get(item.id)?.workspaces ?? []).map((w) => w.id);
		});
	});

	const getWorkspaceIdsNeedingAttention = useCallback((): string[] => {
		const { tabs, panes } = useTabsStore.getState();

		const workspaceStatusMap = new Map<string, boolean>();

		for (const tab of tabs) {
			if (workspaceStatusMap.get(tab.workspaceId)) continue;

			const tabPaneStatuses = Object.values(panes)
				.filter((pane) => pane.tabId === tab.id)
				.map((pane) => pane.status);

			const highestStatus = getHighestPriorityStatus(tabPaneStatuses);
			if (highestStatus) {
				workspaceStatusMap.set(tab.workspaceId, true);
			}
		}

		return allWorkspaceIds.filter((id) => workspaceStatusMap.get(id));
	}, [allWorkspaceIds]);

	const navigateToAttentionWorkspace = useCallback(
		(direction: "next" | "prev") => {
			const attentionIds = getWorkspaceIdsNeedingAttention();
			const targetId = findNextAttentionWorkspace(
				allWorkspaceIds,
				attentionIds,
				currentWorkspaceId,
				direction,
			);
			if (targetId) {
				navigateToWorkspace(targetId, navigate);
			}
		},
		[
			getWorkspaceIdsNeedingAttention,
			currentWorkspaceId,
			allWorkspaceIds,
			navigate,
		],
	);

	useAppHotkey(
		"NEXT_ATTENTION_WORKSPACE",
		() => navigateToAttentionWorkspace("next"),
		undefined,
		[navigateToAttentionWorkspace],
	);

	useAppHotkey(
		"PREV_ATTENTION_WORKSPACE",
		() => navigateToAttentionWorkspace("prev"),
		undefined,
		[navigateToAttentionWorkspace],
	);
}
