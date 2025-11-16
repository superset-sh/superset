import { useCallback } from "react";
import type { Tab } from "shared/types";
import { useWorkspaceContext, useTabContext } from "../../../../contexts";
import TabContent from "./TabContent";
import { TabDropZone } from "./TabDropZone";
import { createSimpleMosaicTree, handleTabDropValidation } from "./mosaic-helpers";

interface SingleTabViewProps {
	tab: Tab;
}

export function SingleTabView({ tab }: SingleTabViewProps) {
	const { currentWorkspace } = useWorkspaceContext();
	const { selectedWorktreeId } = useTabContext();

	const workspaceId = currentWorkspace?.id || "";
	const worktreeId = selectedWorktreeId ?? undefined;

	// Handle tab drop from sidebar
	const handleTabDrop = useCallback(
		async (
			droppedTab: Tab,
			sourceWorktreeId: string,
			sourceWorkspaceId: string,
			position: "top" | "right" | "bottom" | "left" | "center",
		) => {
			if (!worktreeId || !workspaceId) return;

			try {
				// If center, replace the current tab (not implemented yet - could swap tabs)
				if (position === "center") {
					console.log("Center drop not yet implemented for single tab view");
					return;
				}

				// Validate the drop operation
				const validation = await handleTabDropValidation({
					droppedTab,
					currentTabId: tab.id,
					sourceWorktreeId,
					targetWorktreeId: worktreeId,
					workspaceId,
				});

				if (!validation.valid) {
					console.log(`Drop blocked: ${validation.reason}`);
					return;
				}

				const tabToAdd = validation.tab!;

				// Create a new group tab to hold both tabs
				const groupResult = await window.ipcRenderer.invoke("tab-create", {
					workspaceId,
					worktreeId,
					type: "group",
					name: "Split View",
				});

				if (!groupResult.success || !groupResult.tab) {
					console.error("Failed to create group tab:", groupResult.error);
					return;
				}

				const groupTabId = groupResult.tab.id;

				// Move both tabs into the group
				await window.ipcRenderer.invoke("tab-move", {
					workspaceId,
					worktreeId,
					tabId: tab.id,
					targetParentTabId: groupTabId,
					targetIndex: 0,
				});

				await window.ipcRenderer.invoke("tab-move", {
					workspaceId,
					worktreeId,
					tabId: tabToAdd.id,
					targetParentTabId: groupTabId,
					targetIndex: 1,
				});

				// Create the mosaic tree for the group
				const mosaicTree = createSimpleMosaicTree(tab.id, tabToAdd.id, position);

				await window.ipcRenderer.invoke("tab-update-mosaic-tree", {
					workspaceId,
					worktreeId,
					tabId: groupTabId,
					mosaicTree,
				});

				// Trigger a reload to refresh the workspace data and show the new group
				window.location.reload();
			} catch (error) {
				console.error("Failed to handle tab drop:", error);
			}
		},
		[workspaceId, worktreeId, tab.id],
	);

	return (
		<div className="w-full h-full p-2 bg-[#1e1e1e] rounded-sm relative">
			<TabContent tab={tab} groupTabId="" />
			<TabDropZone onDrop={handleTabDrop} />
		</div>
	);
}
